import sharp from "sharp";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { R2_PUBLIC_URL } from "@/lib/r2";
import { assetUrl, ingestAsset, setUsage } from "@/lib/assets/store";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp", "image/gif": "gif",
};

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const post = await prisma.socialPost.findUnique({ where: { id } });
  if (!post || !["events", "linkedin"].includes(post.stream)) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (["published", "skipped", "publishing", "scheduled"].includes(post.status)) {
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

  // Every uploaded graphic lands in the asset library; the post points at the library's copy.
  const user = session.user as { id?: string; name?: string | null; email?: string | null };
  let url: string;
  let assetId: string;
  try {
    const { asset } = await ingestAsset({ bytes, fileName: file.name || `graphic.${TYPES[file.type]}`, mimeType: file.type, folder: "Social",
      tags: [post.stream], actor: { id: user.id ?? null, name: user.name || user.email || null } });
    url = assetUrl(asset.key)!;
    assetId = asset.id;
    const saved = await prisma.socialPost.updateMany({
      where: { id, status: post.status, assetUrl: post.assetUrl, editVersion: post.editVersion },
      data: { assetUrl: url, editVersion: { increment: 1 }, status: "draft", approvedAt: null, approvedById: null },
    });
    if (!saved.count) return NextResponse.json({ error: "The post changed during upload. Refresh and try again." }, { status: 409 });
  } catch (error) {
    console.error("Social graphic upload failed", error);
    return NextResponse.json({ error: "Couldn't save the graphic. Please try again." }, { status: 500 });
  }
  await setUsage(assetId, { targetType: "socialPost", targetId: id, label: `Social post · ${(post.assetSpec as { title?: string } | null)?.title ?? post.stream}`, href: `/admin/workspace/marketing/social?post=${id}` }).catch(() => {});
  return NextResponse.json({ url, editVersion: post.editVersion + 1 });
}
