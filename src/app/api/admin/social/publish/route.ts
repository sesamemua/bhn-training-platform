import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { R2_PUBLIC_URL_PREFIXES, putR2Object, r2PublicUrl } from "@/lib/r2";
import { withSocialTags } from "@/lib/social/tags";
import { BUFFER_CHANNEL_URL, BufferRejected, connectedBufferPage, createBufferPost, readBufferPost, type BufferPost } from "@/lib/social/buffer";
import { GET as speakerGraphic } from "../posts/[id]/image/route";

export const runtime = "nodejs";

const Input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("publish"), id: z.string().min(1).max(100), expectedVersion: z.number().int().nonnegative() }),
  z.object({ action: z.literal("refresh"), id: z.string().min(1).max(100) }),
]);
const select = { id: true, status: true, bufferPostId: true, publishError: true } as const;

function delivered(post: BufferPost) {
  return { bufferPostId: post.id, status: post.status === "sent" ? "published" : "scheduled",
    publishedAt: post.status === "sent" ? new Date(post.sentAt ?? Date.now()) : null,
    publishError: post.status === "error" ? "LinkedIn delivery failed. Check this post in Buffer before taking further action." : null,
  };
}

export async function GET() {
  if (!await requireRole("admin").catch(() => null)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await connectedBufferPage();
    return NextResponse.json({ ready: true, name: "BioHubNet", url: BUFFER_CHANNEL_URL }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return NextResponse.json({ ready: false, error: error instanceof Error ? error.message : "Buffer unavailable.", url: BUFFER_CHANNEL_URL }, { status: 503 });
  }
}

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  const actorId = (session?.user as { id?: string } | undefined)?.id;
  if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (req.headers.get("origin") && req.headers.get("origin") !== req.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const input = Input.safeParse(await req.json().catch(() => null));
  if (!input.success) return NextResponse.json({ error: "Invalid input." }, { status: 400 });
  const post = await prisma.socialPost.findUnique({ where: { id: input.data.id } });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (input.data.action === "refresh") {
    if (!post.bufferPostId) return NextResponse.json({ error: "Check the BioHubNet queue in Buffer. Do not resend an unconfirmed post." }, { status: 409 });
    try {
      const remote = await readBufferPost(post.bufferPostId);
      const saved = await prisma.socialPost.update({ where: { id: post.id }, data: delivered(remote), select });
      return NextResponse.json({ post: saved });
    } catch { return NextResponse.json({ error: "Couldn't check delivery. Open Buffer to check the post." }, { status: 502 }); }
  }
  if (post.status !== "approved" || !post.approvedAt || !post.approvedById || post.bufferPostId || post.editVersion !== input.data.expectedVersion) {
    return NextResponse.json({ error: "Refresh and approve the latest version before posting." }, { status: 409 });
  }
  const text = withSocialTags(post.body);
  if (!text.trim() || text.length > 3000) return NextResponse.json({ error: "LinkedIn allows up to 3,000 characters, including tags. Shorten this post and approve it again." }, { status: 400 });
  const speaker = post.stream === "symposium_2026" && post.kind === "speaker"
    ? await prisma.speaker.findUnique({ where: { id: post.deadlineId }, select: { updatedAt: true } }) : null;
  if (post.stream === "symposium_2026" && (!speaker || speaker.updatedAt > post.approvedAt)) return NextResponse.json({ error: "Speaker details changed. Review and approve the post again." }, { status: 409 });
  if (post.stream === "venture_connect" && post.kind === "reminder") {
    const cycle = await prisma.equipDeadline.findUnique({ where: { id: post.deadlineId }, select: { deadlineAt: true } });
    if (!cycle || Math.abs(cycle.deadlineAt.getTime() - post.daysBefore * 86400000 - post.scheduledFor.getTime()) > 36 * 3600000) return NextResponse.json({ error: "The application deadline changed. Review this post before publishing." }, { status: 409 });
  }
  try { await connectedBufferPage(); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Buffer unavailable." }, { status: 503 }); }
  const claimed = await prisma.socialPost.updateMany({
    where: { id: post.id, status: "approved", editVersion: input.data.expectedVersion, bufferPostId: null, body: post.body, assetUrl: post.assetUrl },
    data: { status: "publishing", publishError: null },
  });
  if (!claimed.count) return NextResponse.json({ error: "The post changed or is already sending. Refresh before continuing." }, { status: 409 });
  let attempted = false;
  let remote: BufferPost | undefined;
  try {
    let image = post.assetUrl;
    if (speaker) {
      const graphic = await speakerGraphic(req, { params: Promise.resolve({ id: post.id }) });
      if (!graphic.ok) throw new Error("The speaker graphic could not be prepared.");
      const bytes = new Uint8Array(await graphic.arrayBuffer());
      if (bytes.length > 3_000_000) throw new Error("The graphic exceeds 3 MB.");
      const key = `social/published/${post.id}/${randomUUID()}.png`;
      await putR2Object(key, bytes, "image/png");
      image = r2PublicUrl(key);
      const latest = await prisma.speaker.findUnique({ where: { id: post.deadlineId }, select: { updatedAt: true } });
      if (!latest || latest.updatedAt.getTime() !== speaker.updatedAt.getTime()) throw new Error("Speaker details changed while preparing the graphic. Review the post again.");
    }
    if (!image || !URL.canParse(image)) throw new Error("Upload a graphic to the platform before publishing.");
    const url = new URL(image);
    if (!R2_PUBLIC_URL_PREFIXES.some(prefix => {
      const base = new URL(prefix);
      return url.protocol === "https:" && !url.username && !url.password && url.origin === base.origin && url.pathname.startsWith(`${base.pathname.replace(/\/$/, "")}/`);
    })) throw new Error("Upload a graphic to the platform before publishing.");
    await prisma.auditLog.create({ data: { actorId, action: "social.post.publish", targetType: "socialPost", targetId: post.id, detail: JSON.stringify({ version: post.editVersion, destination: "BioHubNet LinkedIn Page", assetUrl: image }) } });
    attempted = true;
    remote = await createBufferPost(text, url.href, (post.assetSpec as { title?: string } | null)?.title ?? "BioHubNet social graphic");
    const saved = await prisma.socialPost.update({ where: { id: post.id }, data: delivered(remote), select });
    return NextResponse.json({ post: saved });
  } catch (error) {
    const uncertain = attempted && !(error instanceof BufferRejected);
    // shortcut: Buffer createPost has no idempotency key; uncertain sends stay locked until checked in Buffer.
    const message = uncertain ? "Delivery is unconfirmed. Check the BioHubNet queue in Buffer before posting again." : error instanceof Error ? error.message : "Couldn't prepare the post.";
    const saved = await prisma.socialPost.update({ where: { id: post.id }, data: {
      status: uncertain ? "publishing" : "approved", bufferPostId: remote?.id ?? null, publishError: message,
    }, select }).catch(() => null);
    return NextResponse.json({ error: message, post: saved }, { status: uncertain ? 202 : 502 });
  }
}
