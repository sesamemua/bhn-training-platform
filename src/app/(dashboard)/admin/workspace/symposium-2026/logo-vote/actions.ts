"use server";

/**
 * Casting and withdrawing a vote on the 2026 Symposium logo.
 *
 * Every action re-checks the role. A server action is a public endpoint
 * — the page guard decides what is DRAWN, not what can be called — and
 * a poll anybody can stuff is not a poll.
 */
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { optionById, VOTES_PER_PERSON } from "@/lib/symposium/logo-options";
import type { Tally, Ballot } from "@/lib/symposium/vote-types";

const PAGE = "/admin/workspace/symposium-2026/logo-vote";
const NOTE_MAX = 200;

/**
 * Anyone on staff may vote — this is a house opinion, not an admin
 * setting. Instructors are colleagues too, and a poll that only three
 * people can answer tells you about three people.
 */
async function voter() {
  const session = await requireRole("instructor");
  return session.user as { id?: string; name?: string; email?: string };
}

/** Who voted for what, plus this person's own ballot. */
export async function loadVotes(): Promise<{ tally: Tally; mine: Ballot }> {
  const me = await voter();
  const rows = await prisma.logoVote.findMany({
    select: {
      optionId: true, note: true, userId: true, createdAt: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const counts: Tally["counts"] = {};
  for (const r of rows) {
    // A vote for a candidate that has since been removed from the
    // folder is dropped from the tally rather than drawn as a blank
    // tile with a number under it.
    if (!optionById(r.optionId)) continue;
    const bucket = (counts[r.optionId] ??= { votes: 0, voters: [], notes: [] });
    bucket.votes += 1;
    bucket.voters.push(r.user?.name || r.user?.email?.split("@")[0] || "Someone");
    if (r.note) bucket.notes.push({ who: r.user?.name || "Someone", note: r.note });
  }

  const mineRows = rows.filter((r) => r.userId === me.id && optionById(r.optionId));
  return {
    tally: { counts, ballots: new Set(rows.map((r) => r.userId)).size },
    mine: {
      picks: mineRows.map((r) => r.optionId),
      notes: Object.fromEntries(mineRows.filter((r) => r.note).map((r) => [r.optionId, r.note as string])),
    },
  };
}

/**
 * Add or remove one pick.
 *
 * Toggling rather than a submit-the-whole-ballot call: a ballot posted
 * wholesale would overwrite a pick made in another tab, and the natural
 * gesture on a grid of sixty pictures is clicking one of them.
 */
export async function togglePick(optionId: string): Promise<{ ok: boolean; problem?: string }> {
  const me = await voter();
  if (!me.id) return { ok: false, problem: "No account to vote with." };
  if (!optionById(optionId)) return { ok: false, problem: "That is not one of the candidates." };

  const existing = await prisma.logoVote.findUnique({
    where: { userId_optionId: { userId: me.id, optionId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.logoVote.delete({ where: { id: existing.id } });
    revalidatePath(PAGE);
    return { ok: true };
  }

  // Counted at the moment of writing, not from what the page last drew.
  // Two tabs open on a full ballot would otherwise both think there was
  // room for one more.
  const used = await prisma.logoVote.count({ where: { userId: me.id } });
  if (used >= VOTES_PER_PERSON) {
    return {
      ok: false,
      problem: `You have used all ${VOTES_PER_PERSON} of your picks. Take one back first.`,
    };
  }

  try {
    await prisma.logoVote.create({ data: { userId: me.id, optionId } });
  } catch {
    // The unique index is the real guard; a double-click that races
    // itself lands here and is simply not a second vote.
    return { ok: true };
  }
  revalidatePath(PAGE);
  return { ok: true };
}

/** Say why, against one of your own picks. */
export async function saveNote(optionId: string, note: string): Promise<{ ok: boolean; problem?: string }> {
  const me = await voter();
  if (!me.id) return { ok: false, problem: "No account to vote with." };

  const trimmed = note.trim().slice(0, NOTE_MAX);
  const row = await prisma.logoVote.findUnique({
    where: { userId_optionId: { userId: me.id, optionId } },
    select: { id: true },
  });
  // Notes hang off a vote, so there is nothing to attach one to until
  // you have picked it. Said rather than silently ignored.
  if (!row) return { ok: false, problem: "Pick this one first, then say why." };

  await prisma.logoVote.update({ where: { id: row.id }, data: { note: trimmed || null } });
  revalidatePath(PAGE);
  return { ok: true };
}

/** Take back everything you picked. */
export async function clearMyVotes(): Promise<{ ok: boolean }> {
  const me = await voter();
  if (!me.id) return { ok: false };
  await prisma.logoVote.deleteMany({ where: { userId: me.id } });
  revalidatePath(PAGE);
  return { ok: true };
}
