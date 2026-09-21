/**
 * POST /api/employer/profile/logo
 *
 * Accept a multipart-form image upload, push it to R2 at
 *   logos/<userId>/<timestamp>.<ext>
 * and persist the public URL onto `User.companyLogo`.
 *
 * Why this exists: the only previous way to set a logo was to paste a
 * URL or accept the Google-favicons fallback (which silently fails
 * for many corporate domains). Letting the operator drop a PNG / SVG /
 * JPG file directly removes that friction entirely.
 *
 * Constraints:
 *   • Image content types only (image/png, image/jpeg, image/svg+xml,
 *     image/webp). Anything else → 415.
 *   • 2 MB upper bound — logos are tiny in practice; the cap exists
 *     so a misclick can't fill R2 with a megapixel JPEG.
 *   • Admin / superadmin / employer all allowed (mirrors the PATCH
 *     and auto-fill endpoints).
 *   • Previous R2 object is best-effort deleted so the bucket
 *     doesn't accumulate orphan logos every time the operator
 *     re-uploads.
 */
import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  putR2Object,
  r2PublicUrl,
  R2_PUBLIC_URL,
  deleteR2ObjectByUrl,
} from "@/lib/r2";

export const runtime = "nodejs";

const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/svg+xml",
  "image/webp",
  "image/gif",
]);

const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function POST(req: NextRequest) {
  const session = await getSession();
  const role = (session?.user as { role?: string })?.role ?? "";
  const userId = (session?.user as { id?: string })?.id;
  if (!session || !userId || (role !== "employer" && !["admin", "superadmin"].includes(role))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!R2_PUBLIC_URL) {
    return NextResponse.json({ error: "Storage not configured." }, { status: 503 });
  }

  // Read the multipart body. NextRequest.formData() works in the
  // node runtime since Next 13+.
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof File)) {
    return NextResponse.json({ error: "Expected a `file` field in multipart form data." }, { status: 400 });
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: `Unsupported type ${file.type}. Use PNG / JPG / SVG / WebP / GIF.` },
      { status: 415 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Max 2 MB.` },
      { status: 413 },
    );
  }

  const ext = EXT_BY_TYPE[file.type] ?? "bin";
  const key = `logos/${userId}/${Date.now()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  await putR2Object(key, buffer, file.type);
  const url = r2PublicUrl(key);

  // Persist + best-effort delete of the previous logo so we don't
  // pile up orphans when the operator re-uploads.
  const before = await prisma.user.findUnique({
    where: { id: userId },
    select: { companyLogo: true },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { companyLogo: url },
  });
  if (before?.companyLogo && before.companyLogo !== url) {
    try { await deleteR2ObjectByUrl(before.companyLogo); } catch { /* non-fatal */ }
  }

  // Same invalidation reason as the PATCH endpoint — logo lives on
  // /employer's hero.
  revalidatePath("/employer");
  revalidatePath("/employer/profile");

  return NextResponse.json({ ok: true, url });
}
