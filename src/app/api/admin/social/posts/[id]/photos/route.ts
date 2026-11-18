import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { imageSize } from "@/lib/images/size";
import { putR2Object, r2PublicUrl, deleteR2ObjectByUrl } from "@/lib/r2";
import { socialPhotos } from "@/lib/social/photos";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file"), version = form?.get("expectedVersion");
  if (!(file instanceof File) || !file.size || file.size > 4 * 1024 * 1024 || typeof version !== "string" || !/^\d+$/.test(version)) return NextResponse.json({ error: "Choose a photo under 4 MB." }, { status: 400 });
  const bytes = Buffer.from(await file.arrayBuffer());
  const image = imageSize(bytes);
  if (!image || !["image/jpeg", "image/png", "image/webp"].includes(image.type)) return NextResponse.json({ error: "Choose a JPEG, PNG or WebP photo." }, { status: 400 });
  const { id } = await params;
  const post = await prisma.socialPost.findUnique({ where: { id } });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (!["draft", "approved"].includes(post.status) || post.bufferPostId || post.assetUrl || post.editVersion !== Number(version)) return NextResponse.json({ error: "Refresh before adding photos. Photo sets are for manual posting." }, { status: 409 });
  const photos = socialPhotos(post.assetSpec);
  if (photos.length >= 20) return NextResponse.json({ error: "A post can have up to 20 photos." }, { status: 400 });
  const key = `social/photos/${id}/${randomUUID()}.${image.type.split("/")[1]}`;
  try {
    await putR2Object(key, bytes, image.type);
    const assetSpec = { ...(post.assetSpec as Record<string, unknown> | null), photos: [...photos, { name: file.name.slice(0, 200), url: r2PublicUrl(key) }] };
    const saved = await prisma.$transaction(async tx => {
      const changed = await tx.socialPost.updateMany({ where: { id, status: post.status, editVersion: post.editVersion, assetUrl: null, bufferPostId: null },
        data: { assetSpec, editVersion: { increment: 1 }, status: "draft", approvedAt: null, approvedById: null } });
      if (!changed.count) return false;
      await tx.auditLog.create({ data: { actorId, action: "social.post.photos.add", targetType: "socialPost", targetId: id,
        detail: JSON.stringify({ name: file.name.slice(0, 200), key, originalBytes: bytes.length, version: post.editVersion + 1 }) } });
      return true;
    });
    if (!saved) {
      await deleteR2ObjectByUrl(key);
      return NextResponse.json({ error: "The post changed. Refresh and try again." }, { status: 409 });
    }
    return NextResponse.json({ ok: true, assetSpec, editVersion: post.editVersion + 1 });
  } catch {
    await deleteR2ObjectByUrl(key);
    return NextResponse.json({ error: "The photo could not be saved. Try again." }, { status: 502 });
  }
}
