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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
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
      break;
    case "schedule":
      changed = await prisma.socialPost.updateMany({
        where: { id: post.id, status: post.status, editVersion: post.editVersion },
        data: { status: "scheduled", scheduledFor: new Date(data.at) },
      });
      break;
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
