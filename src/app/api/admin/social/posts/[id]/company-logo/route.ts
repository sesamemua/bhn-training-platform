import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth";
import { EVENT_SLUG } from "@/lib/allocation/symposium-2026";
import { prisma } from "@/lib/prisma";
import { deleteR2ObjectByUrl, putR2Object, r2PublicUrl } from "@/lib/r2";
import { logoOverride } from "@/lib/social/company-logo";
import { SYMPOSIUM_SOCIAL_STREAM } from "@/lib/social/speakers";

export const runtime = "nodejs";

const TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function isImage(bytes: Buffer, mime: string): boolean {
  if (mime === "image/png") return bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
  if (mime === "image/jpeg") return bytes.subarray(0, 3).toString("hex") === "ffd8ff";
  if (mime === "image/webp") return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  return false;
}

async function editablePost(id: string) {
  const post = await prisma.socialPost.findUnique({
    where: { id },
    select: { id: true, stream: true, kind: true, status: true, deadlineId: true, assetSpec: true },
  });
  if (post?.stream !== SYMPOSIUM_SOCIAL_STREAM || post.kind !== "speaker" ||
      post.status === "published" || post.status === "skipped") return null;
  const speaker = await prisma.speaker.findUnique({
    where: { id: post.deadlineId },
    select: { event: { select: { slug: true } } },
  });
  return speaker?.event.slug === EVENT_SLUG ? post : null;
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = await params;
  const post = await editablePost(id);
  if (!post) return NextResponse.json({ error: "Speaker draft not found" }, { status: 404 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("logo");
  if (!(file instanceof File) || file.size === 0 || file.size > 3_000_000 || !TYPES[file.type]) {
    return NextResponse.json({ error: "Choose a PNG, JPEG, or WebP logo under 3 MB." }, { status: 400 });
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!isImage(bytes, file.type)) {
    return NextResponse.json({ error: "That file is not a valid image." }, { status: 400 });
  }

  const key = `social/symposium-2026/company-logos/${id}/${randomUUID()}.${TYPES[file.type]}`;
  await putR2Object(key, bytes, file.type);
  const url = r2PublicUrl(key);
  const spec = post.assetSpec && typeof post.assetSpec === "object" && !Array.isArray(post.assetSpec)
    ? post.assetSpec as Record<string, unknown> : {};
  const previous = logoOverride(spec);
  await prisma.socialPost.update({
    where: { id },
    data: { assetSpec: { ...spec, companyLogoUrl: url } },
  });
  if (previous?.includes(`/social/symposium-2026/company-logos/${id}/`)) {
    await deleteR2ObjectByUrl(previous);
  }
  return NextResponse.json({ url });
}
