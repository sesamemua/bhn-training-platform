import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { IMAGE_TYPES, MAX_ASSET_BYTES } from "@/lib/assets/core";
import { ingestAsset } from "@/lib/assets/store";
import { isSection } from "@/lib/newsletter/types";
import { MAX_NEWSLETTER_IMAGES, NewsletterMediaError, getNewsletterMedia, mutateNewsletterImages } from "@/lib/newsletter/media";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };
const Id = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/);
const Target = z.object({ targetType: z.enum(["section", "piece"]), targetId: Id });
const Action = z.discriminatedUnion("action", [
  Target.extend({ action: z.literal("attach"), assetIds: z.array(Id).min(1).max(MAX_NEWSLETTER_IMAGES) }),
  Target.extend({ action: z.literal("remove"), imageId: Id }),
  Target.extend({ action: z.literal("updateAlt"), imageId: Id, alt: z.string().max(400) }),
  Target.extend({ action: z.literal("reorder"), imageIds: z.array(Id).max(MAX_NEWSLETTER_IMAGES) }),
]);

/** Reject SVG/other formats before the image decoder sees untrusted bytes. */
function hasImageSignature(bytes: Buffer, mime: string): boolean {
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === "image/jpeg") return bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (mime === "image/gif") return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
  return mime === "image/webp" && bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
}

/** Upload many pictures, or attach/remove/reorder already saved pictures. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  if (req.headers.get("sec-fetch-site") === "cross-site") return NextResponse.json({ error: "Invalid origin" }, { status: 403 });
  const { id: issueId } = await ctx.params;
  try {
    if (!req.headers.get("content-type")?.includes("multipart/form-data")) {
      const raw = await req.text();
      if (Buffer.byteLength(raw) > 16_000) return NextResponse.json({ error: "Picture action is too large." }, { status: 413 });
      let body: unknown;
      try { body = JSON.parse(raw); } catch { body = null; }
      const parsed = Action.safeParse(body);
      if (!parsed.success) return NextResponse.json({ error: "Provide a valid picture action and newsletter target." }, { status: 400 });
      const images = await mutateNewsletterImages(issueId, parsed.data, parsed.data);
      return NextResponse.json({ ok: true, images }, { headers: noStore });
    }
    const form = await req.formData().catch(() => null);
    const target = Target.safeParse({ targetType: form?.get("targetType"), targetId: form?.get("targetId") });
    const files = (form?.getAll("files") ?? []).filter((file): file is File => file instanceof File);
    if (!target.success || !files.length || files.length > MAX_NEWSLETTER_IMAGES) {
      return NextResponse.json({ error: `Choose a newsletter target and between 1 and ${MAX_NEWSLETTER_IMAGES} pictures.` }, { status: 400 });
    }
    // Validate before spending storage/processing work, then recheck in the save transaction.
    const issue = await prisma.newsletterIssue.findUnique({ where: { id: issueId }, select: { status: true } });
    if (!issue) throw new NewsletterMediaError("Issue not found.", 404);
    if (issue.status === "sent") throw new NewsletterMediaError("This newsletter has already been sent. Its pictures cannot be changed.", 409);
    if (target.data.targetType === "section") {
      if (!isSection(target.data.targetId)) throw new NewsletterMediaError("Choose a valid newsletter section.");
    } else if (!(await prisma.newsletterPiece.findFirst({ where: { id: target.data.targetId, issueId }, select: { id: true } }))) {
      throw new NewsletterMediaError("Contribution not found in this newsletter.", 404);
    }
    const user = session.user as { id?: string; name?: string | null; email?: string | null };
    const errors: string[] = [];
    const media = await getNewsletterMedia(issueId);
    let images = target.data.targetType === "section" && isSection(target.data.targetId)
      ? media.sectionImages[target.data.targetId] ?? [] : media.imagesByPieceId[target.data.targetId] ?? [];
    for (const file of files) {
      const fileName = file.name.slice(0, 200);
      if (images.length >= MAX_NEWSLETTER_IMAGES) {
        errors.push(`${fileName}: this section or contribution already has ${MAX_NEWSLETTER_IMAGES} pictures.`);
        continue;
      }
      if (!file.size || file.size > MAX_ASSET_BYTES || !(IMAGE_TYPES as readonly string[]).includes(file.type)) {
        errors.push(`${fileName}: choose a PNG, JPEG, WebP or GIF up to 4.3 MB.`);
        continue;
      }
      try {
        const bytes = Buffer.from(await file.arrayBuffer());
        if (!hasImageSignature(bytes, file.type)) {
          errors.push(`${fileName}: this is not the picture type it claims to be.`);
          continue;
        }
        const result = await ingestAsset({ bytes, fileName: file.name, mimeType: file.type,
          folder: "General", tags: ["newsletter"], source: `Newsletter ${issueId}`,
          actor: { id: user.id ?? null, name: user.name || user.email || null } });
        images = await mutateNewsletterImages(issueId, target.data, { action: "attach", assetIds: [result.asset.id] });
      } catch (error) {
        errors.push(`${fileName}: ${error instanceof NewsletterMediaError ? error.message : "could not upload this picture. Check the file and try again."}`);
      }
    }
    // Even a mixed batch saves every successful picture; the client can retry failed files.
    return NextResponse.json({ ok: true, images, ...(errors.length ? { errors } : {}) }, { headers: noStore });
  } catch (error) {
    if (error instanceof NewsletterMediaError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error("Newsletter picture save failed", error);
    return NextResponse.json({ error: "Could not save the pictures. Please try again." }, { status: 500 });
  }
}
