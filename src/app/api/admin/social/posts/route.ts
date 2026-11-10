/**
 * The social queue's write endpoint.
 *
 * Everything a coordinator can do to a drafted post: edit the words,
 * approve it, decline it, schedule it, or mark it posted. Publishing to
 * a network is NOT here — see the note on `markPublished`.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { consentingRecipients, cycleById } from "@/lib/social/cycles";
import { syncCycle, syncRecipients } from "@/lib/social/sync";
import { TERMINAL_STATUSES, type SocialStatus } from "@/lib/social/types";
import { editSocialPost } from "@/lib/social/edit";
import { LINKEDIN_STREAM } from "@/lib/social/review";
import { assetUrl, setUsage } from "@/lib/assets/usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  /* A post the team writes from scratch. requestId makes a double-click one post. */
  z.object({ action: z.literal("create"), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(3000), scheduledFor: z.string().datetime(), requestId: z.string().uuid() }),
  /* A review note; with reviewerId it asks that teammate to review. */
  /* Use a picture from the asset library as the post's graphic. */
  z.object({ action: z.literal("useAsset"), id: z.string().min(1), assetId: z.string().min(1), expectedVersion: z.number().int().nonnegative() }),
  z.object({ action: z.literal("comment"), id: z.string().min(1), body: z.string().trim().min(1).max(2000), reviewerId: z.string().min(1).optional() }),
  z.object({ action: z.literal("edit"), id: z.string().min(1), body: z.string().trim().min(1).max(6000), expectedVersion: z.number().int().nonnegative(), trackChanges: z.boolean() }),
  z.object({ action: z.literal("approve"), id: z.string().min(1), expectedVersion: z.number().int().nonnegative() }),
  /* Back to draft. The words stay — an unapprove is "I want to change
     this", not "throw it away". */
  z.object({ action: z.literal("unapprove"), id: z.string().min(1) }),
  z.object({ action: z.literal("skip"), id: z.string().min(1) }),
  z.object({ action: z.literal("schedule"), id: z.string().min(1), at: z.string().datetime() }),
  /* A human posted it somewhere. Recorded, not performed — see below. */
  z.object({ action: z.literal("markPublished"), id: z.string().min(1) }),
  /* Written back by the image renderer, which a separate agent owns. */
  z.object({ action: z.literal("setAsset"), id: z.string().min(1), assetUrl: z.string().url().max(500) }),
  z.object({ action: z.literal("regenerate"), deadlineId: z.string().min(1) }),
  z.object({ action: z.literal("draftRecipients"), deadlineId: z.string().min(1), showAmounts: z.boolean().optional() }),
]);

export async function POST(req: NextRequest) {
  const session = await requireRole("admin").catch(() => null);
  if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Same shape the EQUIP deadline routes use to name the actor.
  const actorId = (session.user as { id?: string } | undefined)?.id ?? null;

  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  const data = parsed.data;

  if (data.action === "edit") {
    if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const outcome = await prisma.$transaction((tx) => editSocialPost(tx, actorId, data));
    return NextResponse.json(outcome.result, { status: outcome.status });
  }

  if (data.action === "create") {
    const key = `${LINKEDIN_STREAM}:post:${data.requestId}:0`;
    const post = await prisma.socialPost.upsert({
      where: { key }, update: {},
      create: { key, stream: LINKEDIN_STREAM, kind: "post", deadlineId: data.requestId, body: data.body,
        scheduledFor: new Date(data.scheduledFor), assetSpec: { title: data.title } },
    });
    return NextResponse.json({ ok: true, post: { id: post.id, body: post.body, editVersion: post.editVersion, scheduledFor: post.scheduledFor.toISOString() } });
  }

  if (data.action === "useAsset") {
    const [post, asset] = await Promise.all([
      prisma.socialPost.findUnique({ where: { id: data.id }, select: { id: true, status: true, stream: true, editVersion: true, assetSpec: true } }),
      prisma.asset.findFirst({ where: { id: data.assetId, deletedAt: null }, select: { id: true, key: true } }),
    ]);
    if (!post || !asset) return NextResponse.json({ error: "That post or picture no longer exists." }, { status: 404 });
    if (!["draft", "approved"].includes(post.status)) return NextResponse.json({ error: "This post can no longer be edited." }, { status: 409 });
    const url = assetUrl(asset.key)!;
    const saved = await prisma.socialPost.updateMany({
      where: { id: post.id, editVersion: data.expectedVersion, status: post.status },
      data: { assetUrl: url, editVersion: { increment: 1 }, status: "draft", approvedAt: null, approvedById: null },
    });
    if (!saved.count) return NextResponse.json({ error: "The post changed. Refresh and try again." }, { status: 409 });
    await setUsage(asset.id, { targetType: "socialPost", targetId: post.id, label: `Social post · ${(post.assetSpec as { title?: string } | null)?.title ?? post.stream}`, href: `/admin/workspace/marketing/social?post=${post.id}` });
    return NextResponse.json({ ok: true, url, editVersion: data.expectedVersion + 1 });
  }

  if (data.action === "comment") {
    if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const target = await prisma.socialPost.findUnique({ where: { id: data.id }, select: { id: true } });
    if (!target) return NextResponse.json({ error: "Unknown post." }, { status: 404 });
    const reviewer = data.reviewerId
      ? await prisma.user.findFirst({ where: { id: data.reviewerId, role: { in: ["admin", "superadmin"] } }, select: { id: true, name: true, email: true } })
      : null;
    if (data.reviewerId && !reviewer) return NextResponse.json({ error: "Pick a teammate on the list." }, { status: 400 });
    const reviewerName = reviewer ? reviewer.name || reviewer.email || "Team member" : null;
    const entry = await prisma.auditLog.create({
      data: { actorId, action: "social.post.comment", targetType: "socialPost", targetId: target.id,
        detail: JSON.stringify({ body: data.body, reviewerId: reviewer?.id ?? null, reviewerName }) },
      select: { id: true, createdAt: true, actor: { select: { name: true } } },
    });
    return NextResponse.json({ ok: true, comment: { id: entry.id, at: entry.createdAt.toISOString(), author: entry.actor.name ?? "Team member", body: data.body, reviewerName } });
  }

  if (data.action === "regenerate") {
    const cycle = await cycleById(prisma, data.deadlineId);
    if (!cycle) return NextResponse.json({ error: "Unknown cycle." }, { status: 404 });
    const r = await syncCycle(prisma, cycle, new Date());
    return NextResponse.json({ ok: true, ...r });
  }

  if (data.action === "draftRecipients") {
    const cycle = await cycleById(prisma, data.deadlineId);
    if (!cycle) return NextResponse.json({ error: "Unknown cycle." }, { status: 404 });
    const { recipients, withheld } = await consentingRecipients(prisma, cycle);
    const outcome = await syncRecipients(prisma, cycle, recipients, new Date(), data.showAmounts !== false);
    return NextResponse.json({ ok: true, outcome, named: recipients.length, withheld });
  }

  const post = await prisma.socialPost.findUnique({
    where: { id: data.id },
    select: { id: true, status: true, editVersion: true },
  });
  if (!post) return NextResponse.json({ error: "Unknown post." }, { status: 404 });

  /*
   * A published post is finished.
   *
   * Editing the words of something already out in the world would make
   * this queue disagree with what people actually read, which is worse
   * than having no record at all.
   */
  if (["publishing", "scheduled"].includes(post.status) || (post.status === "published" && data.action !== "setAsset")) {
    return NextResponse.json({ error: "That post has already gone out." }, { status: 409 });
  }

  let changed: { count: number } | undefined;
  switch (data.action) {
    case "approve": {
      if (!actorId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (TERMINAL_STATUSES.includes(post.status as SocialStatus)) {
        return NextResponse.json({ error: "That post can no longer be approved." }, { status: 409 });
      }
      const approvedAt = new Date();
      const approved = await prisma.socialPost.updateMany({
        where: { id: post.id, editVersion: data.expectedVersion, status: post.status },
        data: { status: "approved", approvedAt, approvedById: actorId },
      });
      if (!approved.count) return NextResponse.json({ error: "The post changed. Refresh before approving." }, { status: 409 });
      return NextResponse.json({ ok: true, approvedAt: approvedAt.toISOString(), approvedByName: session.user?.name ?? null });
    }
    case "unapprove":
      changed = await prisma.socialPost.updateMany({
        where: { id: post.id, status: post.status, editVersion: post.editVersion },
        data: { status: "draft", approvedAt: null, approvedById: null },
      });
      break;
    case "skip":
      changed = await prisma.socialPost.updateMany({ where: { id: post.id, status: post.status, editVersion: post.editVersion }, data: { status: "skipped" } });
      // A declined post no longer uses its picture, so the library may let it go.
      if (changed.count) await setUsage(null, { targetType: "socialPost", targetId: post.id, label: "" }).catch(() => {});
      break;
    case "schedule":
      return NextResponse.json({ error: "Use Schedule on an approved post to queue it with Buffer. Saving a date alone does not schedule publication." }, { status: 409 });
    case "markPublished":
      /*
       * RECORDED, NOT PERFORMED.
       *
       * Used only for a post shared manually outside the platform.
       * Direct publishing and delivery confirmation live in /social/publish.
       */
      /* Conditional, so a double-click or two coordinators pressing at
         once cannot stamp two different publishedAt values on one post.
         The same claim-before-send discipline the newsletter reminders
         use, applied to a human action instead of a send. */
      changed = await prisma.socialPost.updateMany({
        where: { id: post.id, status: post.status, editVersion: post.editVersion },
        data: { status: "published", publishedAt: new Date() },
      });
      break;
    case "setAsset": {
      if (TERMINAL_STATUSES.includes(post.status as SocialStatus)) return NextResponse.json({ error: "This post can no longer be edited." }, { status: 409 });
      const saved = await prisma.socialPost.updateMany({
        where: { id: post.id, editVersion: post.editVersion, status: post.status },
        data: { assetUrl: data.assetUrl, editVersion: { increment: 1 }, status: "draft", approvedAt: null, approvedById: null },
      });
      if (!saved.count) return NextResponse.json({ error: "The post changed. Refresh and try again." }, { status: 409 });
      break;
    }
  }

  if (changed && !changed.count) return NextResponse.json({ error: "The post changed or is sending. Refresh before continuing." }, { status: 409 });
  return NextResponse.json({ ok: true });
}
