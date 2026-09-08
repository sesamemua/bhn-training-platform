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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("edit"), id: z.string().min(1), body: z.string().trim().min(1).max(6000) }),
  z.object({ action: z.literal("approve"), id: z.string().min(1) }),
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
    select: { id: true, status: true },
  });
  if (!post) return NextResponse.json({ error: "Unknown post." }, { status: 404 });

  /*
   * A published post is finished.
   *
   * Editing the words of something already out in the world would make
   * this queue disagree with what people actually read, which is worse
   * than having no record at all.
   */
  if (post.status === "published" && data.action !== "setAsset") {
    return NextResponse.json({ error: "That post has already gone out." }, { status: 409 });
  }

  switch (data.action) {
    case "edit": {
      if (TERMINAL_STATUSES.includes(post.status as SocialStatus)) {
        return NextResponse.json({ error: "That post can no longer be edited." }, { status: 409 });
      }
      await prisma.socialPost.update({ where: { id: post.id }, data: { body: data.body } });
      break;
    }
    case "approve":
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "approved", approvedAt: new Date(), approvedById: actorId },
      });
      break;
    case "unapprove":
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "draft", approvedAt: null, approvedById: null },
      });
      break;
    case "skip":
      await prisma.socialPost.update({ where: { id: post.id }, data: { status: "skipped" } });
      break;
    case "schedule":
      await prisma.socialPost.update({
        where: { id: post.id },
        data: { status: "scheduled", scheduledFor: new Date(data.at) },
      });
      break;
    case "markPublished":
      /*
       * RECORDED, NOT PERFORMED.
       *
       * Nothing in this codebase can post to LinkedIn: there is no
       * OAuth token store and no third-party publishing integration of
       * any kind. Direct publishing needs a LinkedIn app, OAuth and
       * their app review, which is a decision about credentials rather
       * than a piece of work. Until then a coordinator copies the words
       * and the image, posts them, and presses this — so the queue
       * still knows what went out and the reminder ladder does not
       * re-offer it.
       */
      /* Conditional, so a double-click or two coordinators pressing at
         once cannot stamp two different publishedAt values on one post.
         The same claim-before-send discipline the newsletter reminders
         use, applied to a human action instead of a send. */
      await prisma.socialPost.updateMany({
        where: { id: post.id, status: { not: "published" } },
        data: { status: "published", publishedAt: new Date() },
      });
      break;
    case "setAsset":
      await prisma.socialPost.update({ where: { id: post.id }, data: { assetUrl: data.assetUrl } });
      break;
  }

  return NextResponse.json({ ok: true });
}
