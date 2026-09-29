import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl, putR2Object, r2PublicUrl, R2_PUBLIC_URL } from "@/lib/r2";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const post = await prisma.socialPost.findUnique({ where: { id } });
  if (!post || post.stream !== "events") return NextResponse.json({ error: "Event post not found." }, { status: 404 });
  if (post.status === "published" || post.status === "skipped") {
    return NextResponse.json({ error: "This post can no longer be edited." }, { status: 409 });
  }
  if (!R2_PUBLIC_URL) return NextResponse.json({ error: "Image storage is unavailable." }, { status: 503 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("graphic");
  if (!(file instanceof File) || !file.size || file.size > 3_000_000 || !TYPES[file.type]) {
    return NextResponse.json({ error: "Choose a PNG, JPEG, WebP or GIF under 3 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata().catch(() => null);
  if (!metadata || metadata.format !== TYPES[file.type]) {
    return NextResponse.json({ error: "That file is not a valid image." }, { status: 400 });
  }

  const key = `social/events/${id}/${randomUUID()}.${TYPES[file.type]}`;
  const url = r2PublicUrl(key);
  try {
    await putR2Object(key, bytes, file.type);
    const saved = await prisma.socialPost.updateMany({
      where: { id, status: post.status, assetUrl: post.assetUrl },
      data: { assetUrl: url, status: "draft", approvedAt: null, approvedById: null },
    });
    if (!saved.count) {
      await deleteR2ObjectByUrl(url);
      return NextResponse.json({ error: "The post changed during upload. Refresh and try again." }, { status: 409 });
    }
  } catch (error) {
    console.error("Social graphic upload failed", error);
    return NextResponse.json({ error: "Couldn't save the graphic. Please try again." }, { status: 500 });
  }
  return NextResponse.json({ url });
}
