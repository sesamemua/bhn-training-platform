/**
 * Bringing the database in line with what the planner says should exist.
 *
 * ADDS ONLY. A post that exists is never rewritten by a later run
 * unless it is still an untouched draft, and a post a person has
 * approved, published or declined is never touched at all. The daily
 * job runs every morning for months against the same cycle; the one
 * thing it must not do is undo somebody's edit.
 *
 * The unique key does the real work. Two runs racing, or a run
 * repeating after a timeout, both land on the same rows.
 */
import type { PrismaClient } from "@prisma/client";
import { draftPost } from "./copy";
import { isOverdue, planCycle } from "./plan";
import { postKey, TERMINAL_STATUSES, type CycleFacts, type Recipient, type SocialStatus } from "./types";

export interface SyncResult {
  created: string[];
  /** Rungs whose day had already gone — recorded as skipped, not queued. */
  backfilled: string[];
  /** Untouched drafts whose facts moved — rewritten to match. */
  refreshed: string[];
  /** Left alone because a person had already worked on them. */
  keptAsIs: string[];
}

/**
 * A draft nobody has touched may be regenerated; anything else may not.
 *
 * `approved` is deliberately in the do-not-touch list even though it has
 * not gone out: somebody read those exact words and said yes to them.
 * Rewriting them under an approval is worse than letting the post carry
 * a superseded date, which the queue flags separately.
 */
export function mayRegenerate(status: SocialStatus, editedAt: Date | null, createdAt: Date): boolean {
  if (status !== "draft") return false;
  if (TERMINAL_STATUSES.includes(status)) return false;
  // updatedAt moving past createdAt means a human saved something.
  return !editedAt || editedAt.getTime() - createdAt.getTime() < 1000;
}

export async function syncCycle(
  prisma: PrismaClient,
  facts: CycleFacts,
  now: Date,
): Promise<SyncResult> {
  const planned = planCycle(facts, now);
  const keys = planned.map(postKey);
  const existing = await prisma.socialPost.findMany({
    where: { key: { in: keys } },
    select: { key: true, status: true, createdAt: true, updatedAt: true },
  });
  const byKey = new Map(existing.map((e) => [e.key, e]));

  const result: SyncResult = { created: [], backfilled: [], refreshed: [], keptAsIs: [] };

  for (const p of planned) {
    const key = postKey(p);
    const draft = draftPost({
      kind: p.kind,
      facts,
      daysLeft: p.kind === "reminder" ? p.daysBefore : undefined,
    });
    const found = byKey.get(key);

    if (!found) {
      /*
       * BACKFILLING IS NEVER A DRAFT SOMEBODY HAS TO DEAL WITH.
       *
       * A cycle created three days before its deadline plans a 14-day
       * rung whose day is already gone. Creating that as a draft puts a
       * post in the queue that nobody can ever send on time and that
       * somebody has to decline by hand — for every cycle, forever.
       * It is created as `skipped` instead: the row exists, so the key
       * is taken and the next run will not try again, and the queue
       * stays a list of things that can still be done.
       *
       * The newsletter learned this the hard way with its own reminder
       * ladder ("Backfilling the calendar must never be a send",
       * lib/newsletter/calendar.ts). Nothing here sends on its own, so
       * the cost is noise rather than a wrong email — but a queue full
       * of posts you cannot action is how a queue stops being read.
       */
      const alreadyPast = isOverdue(p.scheduledFor, now);
      await prisma.socialPost.create({
        data: {
          stream: p.stream,
          kind: p.kind,
          deadlineId: p.deadlineId,
          daysBefore: p.daysBefore,
          key,
          status: alreadyPast ? "skipped" : "draft",
          body: draft.body,
          assetSpec: draft.asset as unknown as object,
          scheduledFor: p.scheduledFor,
        },
      });
      (alreadyPast ? result.backfilled : result.created).push(key);
      continue;
    }

    if (mayRegenerate(found.status as SocialStatus, found.updatedAt, found.createdAt)) {
      await prisma.socialPost.update({
        where: { key },
        data: {
          body: draft.body,
          assetSpec: draft.asset as unknown as object,
          scheduledFor: p.scheduledFor,
        },
      });
      result.refreshed.push(key);
    } else {
      result.keptAsIs.push(key);
    }
  }
  return result;
}

/**
 * The recipients post, created once there is somebody to name.
 *
 * Only ever created, never refreshed: the list of who was funded is a
 * decision, and regenerating it under a coordinator who has edited the
 * wording would be the worst version of this feature.
 */
export async function syncRecipients(
  prisma: PrismaClient,
  facts: CycleFacts,
  recipients: Recipient[],
  now: Date,
  showAmounts = true,
): Promise<"created" | "exists" | "nobody-consented"> {
  if (recipients.length === 0) return "nobody-consented";
  const key = postKey({ stream: facts.stream, kind: "recipients", deadlineId: facts.deadlineId, daysBefore: 0 });
  const found = await prisma.socialPost.findUnique({ where: { key }, select: { id: true } });
  if (found) return "exists";
  const draft = draftPost({ kind: "recipients", facts, recipients, showAmounts });
  await prisma.socialPost.create({
    data: {
      stream: facts.stream,
      kind: "recipients",
      deadlineId: facts.deadlineId,
      daysBefore: 0,
      key,
      body: draft.body,
      assetSpec: draft.asset as unknown as object,
      scheduledFor: now,
    },
  });
  return "created";
}
