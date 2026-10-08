/**
 * POST /api/workspace/design-review/upload — staff only. One page of an
 * artwork, already an image (the browser renders a PDF's pages before
 * sending them): stored in R2 under design-review/, returned as
 * { ok, key, url } for the artwork that is about to be created.
 *
 * Body: multipart/form-data — file (JPEG / PNG / WebP, ≤ 4 MB).
 */
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth";
import { putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";
import { KEY_PREFIX, MAX_PAGE_BYTES, PAGE_TYPES } from "@/lib/design-review/types";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await requireRole("instructor").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!R2_PUBLIC_URL) return NextResponse.json({ error: "Uploads aren't configured." }, { status: 500 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: "No image was sent." }, { status: 400 });
  if (file.size > MAX_PAGE_BYTES) return NextResponse.json({ error: "That page is too large to upload." }, { status: 413 });
  const ext = PAGE_TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Pages must be JPEG, PNG or WebP images." }, { status: 400 });
  // 128-bit name: the bucket is public, and unreleased designs should not be guessable.
  const key = `${KEY_PREFIX}${randomUUID()}.${ext}`;
  try {
    await putR2Object(key, Buffer.from(await file.arrayBuffer()), file.type);
  } catch (err) {
    console.error("[design-review] upload failed:", err);
    return NextResponse.json({ error: "The upload failed — try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true, key, url: r2PublicUrl(key) });
}
