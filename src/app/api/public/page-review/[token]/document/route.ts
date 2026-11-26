import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { reportTransaction } from "@/lib/symposium-report/store";
import { verifyPageReviewViewerToken } from "@/lib/page-review/viewer";
import { editReviewHtml, htmlRevision } from "@/lib/page-review/edit-html";
import { editReviewImages, imageEditSchema } from "@/lib/page-review/edit-images";
import { imageTransformSchema, newsletterReviewImages, resolveReviewImageEdits, ReviewImageError, saveReviewImageReferences, uploadReviewPicture } from "@/lib/newsletter/review-images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS", "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers });
const revisionSchema = z.object({
  expectedRound: z.number().int().positive(),
  revision: z.string().regex(/^[a-f0-9]{64}$/),
  issueRevision: z.string().datetime(),
});
const schema = revisionSchema.extend({
  edits: z.array(z.object({ index: z.number().int().nonnegative(), before: z.string().max(30000), after: z.string().max(30000) })).max(200).default([]),
  images: z.array(imageEditSchema).max(50).default([]),
}).refine(input => input.edits.length + input.images.length > 0);
class Conflict extends Error {}

async function context(req: NextRequest, token: string) {
  const review = await prisma.pageReview.findUnique({ where: { shareToken: token } });
  if (!review || !review.id.startsWith("newsletter-") || review.kind !== "paste" || !review.pastedHtml) return null;
  const viewer = await verifyPageReviewViewerToken((req.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), review.id);
  if (!viewer || viewer.kind !== "user") return null;
  const user = await prisma.user.findUnique({ where: { id: viewer.userId }, select: { id: true, role: true, isActive: true } });
  if (!user?.isActive || !["instructor", "admin", "superadmin"].includes(user.role)) return null;
  return { review, viewer };
}
export async function OPTIONS() { return new NextResponse(null, { status: 204, headers }); }
export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const source = await context(req, (await ctx.params).token);
  if (!source) return json({ error: "Staff sign-in is required to edit this newsletter." }, 403);
  const issue = await prisma.newsletterIssue.findUnique({ where: { id: source.review.id.slice(11) }, select: { status: true, updatedAt: true } });
  return json({ ok: true, editable: source.review.status === "open" && !!issue && issue.status !== "sent",
    round: source.review.round, revision: htmlRevision(source.review.pastedHtml!), issueRevision: issue?.updatedAt.toISOString(),
    images: await newsletterReviewImages(source.review.pastedHtml!) });
}

/** Upload or bake a new rendition; the newsletter changes only when PATCH saves it. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const source = await context(req, (await ctx.params).token);
  if (!source) return json({ error: "Staff sign-in is required to edit this newsletter." }, 403);
  if (!req.headers.get("content-type")?.includes("multipart/form-data")) return json({ error: "Choose a picture to upload." }, 415);
  if (Number(req.headers.get("content-length")) > 4_400_000) return json({ error: "Choose a picture under 4.3 MB." }, 413);
  const form = await req.formData().catch(() => null);
  const revision = revisionSchema.safeParse({ expectedRound: Number(form?.get("expectedRound")), revision: form?.get("revision"), issueRevision: form?.get("issueRevision") });
  const file = form?.get("file"), assetId = form?.get("assetId"), transformValue = form?.get("transform");
  const transform = transformValue === null || transformValue === undefined ? undefined : imageTransformSchema.safeParse(
    await Promise.resolve().then(() => JSON.parse(String(transformValue))).catch(() => null));
  if (!revision.success || (!!(file instanceof File) === !!assetId) || (assetId && (typeof assetId !== "string" || !/^[a-zA-Z0-9_-]{1,120}$/.test(assetId))) || (transform && !transform.success)) {
    return json({ error: "Choose one picture and provide the displayed revision and valid adjustments." }, 400);
  }
  const issueId = source.review.id.slice(11);
  const issue = await prisma.newsletterIssue.findUnique({ where: { id: issueId }, select: { status: true, updatedAt: true } });
  if (source.review.status !== "open" || source.review.round !== revision.data.expectedRound || htmlRevision(source.review.pastedHtml!) !== revision.data.revision ||
    !issue || issue.status === "sent" || issue.updatedAt.toISOString() !== revision.data.issueRevision) {
    return json({ error: "This review changed or is locked. Reload before uploading a picture." }, 409);
  }
  try {
    const asset = await uploadReviewPicture({ ...(file instanceof File ? { file } : { assetId: String(assetId) }),
      ...(transform?.success ? { transform: transform.data } : {}), issueId, actorId: source.viewer.userId });
    return json({ ok: true, asset });
  } catch (error) {
    if (error instanceof ReviewImageError) return json({ error: error.message }, error.status);
    console.error("Newsletter review picture upload failed", error);
    return json({ error: "This picture could not be processed. Try another file or a smaller image." }, 415);
  }
}
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const token = (await ctx.params).token;
  const source = await context(req, token);
  if (!source) return json({ error: "Staff sign-in is required to edit this newsletter." }, 403);
  const raw = await req.text();
  if (raw.length > 1_000_000) return json({ error: "Save fewer changes at once." }, 413);
  const input = schema.safeParse(await Promise.resolve().then(() => JSON.parse(raw || "null")).catch(() => null));
  if (!input.success) return json({ error: "Provide the displayed revision and valid text or picture changes." }, 400);
  try {
    return await reportTransaction(async db => {
      const review = await db.pageReview.findUnique({ where: { id: source.review.id } });
      if (!review?.pastedHtml || review.status !== "open" || review.round !== input.data.expectedRound || htmlRevision(review.pastedHtml) !== input.data.revision) {
        return json({ error: "A colleague changed this review. Your unsaved edits are still on this page; copy them before reloading." }, 409);
      }
      const edits = input.data.edits.filter(edit => edit.before !== edit.after);
      const pictures = await resolveReviewImageEdits(db, input.data.images);
      const changed = editReviewImages(edits.length ? editReviewHtml(review.pastedHtml, edits) : review.pastedHtml, pictures);
      if (!edits.length && !changed.changes.length) return json({ ok: true, unchanged: true });
      const html = changed.html;
      if (html.length > 1_000_000) return json({ error: "The edited newsletter is too large. Shorten the changes before saving." }, 413);
      const issue = await db.newsletterIssue.updateMany({
        where: { id: review.id.slice(11), status: { not: "sent" }, updatedAt: new Date(input.data.issueRevision) },
        data: { renderedHtml: html, renderedAt: new Date() },
      });
      if (!issue.count) throw new Conflict("The newsletter changed or was sent. Your edits have not been overwritten; copy them before reloading.");
      await saveReviewImageReferences(db, review.id.slice(11), changed.changes);
      await db.pageReviewVersion.create({ data: { reviewId: review.id, round: review.round, html: review.pastedHtml } });
      const saved = await db.pageReview.updateMany({
        where: { id: review.id, round: review.round, status: "open", pastedHtml: review.pastedHtml },
        data: { pastedHtml: html, snapshotHtml: review.pastedHtml, snapshotAt: new Date(), round: { increment: 1 } },
      });
      if (!saved.count) throw new Conflict("A colleague saved first. Your edits are still on the page; copy them before reloading.");
      await db.auditLog.create({ data: { actorId: source.viewer.userId, action: changed.changes.length ? "newsletter.review.image-edit" : "newsletter.review.text-edit", targetType: "PageReview", targetId: review.id,
        detail: JSON.stringify({ round: review.round, nextRound: review.round + 1, edits, ...(changed.changes.length ? { images: changed.changes } : {}) }) } });
      return json({ ok: true, round: review.round + 1 });
    });
  } catch (error) {
    if (error instanceof Conflict) return json({ error: error.message }, 409);
    if (error instanceof ReviewImageError) return json({ error: error.message }, error.status);
    if (error instanceof Error && error.message.startsWith("The selected text changed")) return json({ error: error.message }, 409);
    if (error instanceof Error && error.message.startsWith("The selected image changed")) return json({ error: error.message }, 409);
    throw error;
  }
}
