/**
 * Event cover-image upload.
 *
 *   POST /api/admin/events/[slug]/cover-image
 *     multipart/form-data with `file` part
 *     → uploads to R2, updates BhnEvent.coverImageUrl, returns the URL.
 *
 * Image-only (PNG / JPG / WebP / AVIF). Max 8 MB. Key includes a
 * random token so re-uploads don't collide and old objects can be
 * best-effort deleted.
 */
import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { putR2Object, r2PublicUrl, deleteR2ObjectByUrl } from "@/lib/r2";

export const runtime = "nodejs";

const MAX_SIZE = 8 * 1024 * 1024;
const EXT_OK = new Set(["png", "jpg", "jpeg", "webp", "avif"]);
const MIME_BY_EXT: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", avif: "image/avif",
};

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ slug: string }> },
) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { slug } = await ctx.params;
  const event = await prisma.bhnEvent.findUnique({
    where: { slug },
    select: { id: true, coverImageUrl: true },
  });
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });

  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 }); }

  const file = form.get("file");
  if (!(file instanceof Blob)) {
    return NextResponse.json({ error: "file part required" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large. Max ${MAX_SIZE / 1024 / 1024} MB.` },
      { status: 413 },
    );
  }

  const filename = (file as File).name ?? "cover";
  const ext = (filename.split(".").pop() ?? "").toLowerCase();
  if (!EXT_OK.has(ext)) {
    return NextResponse.json(
      { error: `Unsupported file type. Use one of: ${[...EXT_OK].join(", ")}` },
      { status: 415 },
    );
  }
  const contentType = MIME_BY_EXT[ext] ?? "application/octet-stream";

  // Fresh token per upload so old URLs become stale + best-effort
  // delete the previous object so storage doesn't leak.
  const token = randomBytes(8).toString("hex");
  const key = `events/${event.id}/${token}/cover.${ext}`;

  const buf = Buffer.from(await file.arrayBuffer());
  await putR2Object(key, buf, contentType);
  const url = r2PublicUrl(key);

  // Best-effort cleanup of the previous cover. Don't fail the upload
  // if cleanup throws (orphan storage is preferable to a broken UX).
  if (event.coverImageUrl) {
    try { await deleteR2ObjectByUrl(event.coverImageUrl); }
    catch (err) { console.error("Cover cleanup failed:", (err as Error).message); }
  }

  await prisma.bhnEvent.update({
    where: { id: event.id },
    data: { coverImageUrl: url },
  });
  return NextResponse.json({ ok: true, url });
}
