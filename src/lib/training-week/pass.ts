/**
 * Training Week passes and check-in: the database side.
 *
 * The rules — who gets in, which session is "now" — are in
 * ./check-in.ts. This file finds people, counts rooms and records
 * check-ins, so the phone at the door and the laptop at the desk go
 * through one path and cannot disagree.
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { absolute } from "@/lib/notify/email";
import { registrantName } from "@/lib/allocation/registrant-name";
import { doorVerdict, hasSpace, withdrawProblem, type DoorVerdict } from "./check-in";
import { isInternal } from "./internal";
import { loadInternalSet } from "./internal-server";
import { mailConfigured, sendMail } from "@/lib/mail";
import { sendDecisionLetter } from "@/lib/formbuilder/acknowledge";

/** The pass page for a code. */
export const passUrl = (token: string) => absolute(`/training-week/pass/${token}`);

/** "I can't make it" for one seat — the pass code says who, the seat says which session. */
export const cantAttendUrl = (token: string, bookingId: string) =>
  absolute(`/training-week/pass/${token}/cant-attend/${bookingId}`);

/**
 * The pass code for a registration, made the first time it is needed.
 *
 * Race-safe: two letters sent to the same person at the same moment
 * both write only if nothing is there yet, then both read back the one
 * that won — so a person never has two passes, one of them dead.
 */
export async function passTokenFor(submissionId: string): Promise<string> {
  const existing = await prisma.eventFormSubmission.findUnique({
    where: { id: submissionId },
    select: { checkInToken: true },
  });
  if (existing?.checkInToken) return existing.checkInToken;
  await prisma.eventFormSubmission.updateMany({
    where: { id: submissionId, checkInToken: null },
    data: { checkInToken: randomBytes(18).toString("base64url") },
  });
  const now = await prisma.eventFormSubmission.findUnique({
    where: { id: submissionId },
    select: { checkInToken: true },
  });
  return now!.checkInToken!;
}

const when = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit",
  }).format(d);

export interface DoorCard {
  verdict: DoorVerdict;
  name: string;
  email: string;
  /** Their seat in this session: pending | confirmed | waitlist | cancelled, or null. */
  status: string | null;
  checkedInAt: string | null;
  bookingId: string | null;
  /** Where they do have seats, so somebody at the wrong door can be sent to the right one. */
  otherSessions: { title: string; when: string; status: string }[];
  room: { checkedIn: number; capacity: number; internalIn: number };
  /** BioHubNet staff or a listed guest. */
  internal: boolean;
}

/** Who is internal, for this request: the list read once. */
async function internalTest() {
  const { keys } = await loadInternalSet();
  return (b: { submission: { email: string | null; data: unknown } | null; user: { email: string } | null }) => {
    const data = (b.submission?.data ?? {}) as Record<string, unknown>;
    return isInternal(
      [typeof data.trainee_email === "string" ? data.trainee_email : null, b.submission?.email, b.user?.email],
      data, keys,
    );
  };
}

/**
 * Who is in the room. `checkedIn` is students only — it is what the
 * room's capacity is measured against, so staff sitting in never cost a
 * waitlisted student their chance of a chair. Internal people are
 * counted beside it.
 */
async function roomFacts(workshopId: string) {
  const [w, inRoom, internal] = await Promise.all([
    prisma.workshop.findUnique({ where: { id: workshopId }, select: { capacity: true } }),
    prisma.workshopBooking.findMany({
      where: { workshopId, checkedInAt: { not: null } },
      select: { submission: { select: { email: true, data: true } }, user: { select: { email: true } } },
    }),
    internalTest(),
  ]);
  const staff = inRoom.filter(internal).length;
  return { capacity: w?.capacity ?? 0, checkedIn: inRoom.length - staff, internalIn: staff };
}

/**
 * One person at one door.
 *
 * Identified by the code on their pass (a scan) or by a seat picked from
 * the list (the laptop). Records a check-in when the rules say "in" —
 * straight away for an approved seat, only on `letIn` for a waitlisted
 * or undecided one — and otherwise just says why not.
 */
export async function checkInAtDoor(input: {
  workshopId: string;
  token?: string;
  bookingId?: string;
  letIn?: boolean;
  adminId: string | null;
  method: "scan" | "manual";
}): Promise<DoorCard> {
  const room = await roomFacts(input.workshopId);
  const blank: DoorCard = {
    verdict: "unknown", name: "", email: "", status: null, checkedInAt: null, bookingId: null, otherSessions: [], room, internal: false,
  };

  // Who: the registration behind the code, or behind the chosen seat.
  let submissionId: string | null = null;
  let bookingInRoom: { id: string; status: string; checkedInAt: Date | null; submissionId: string | null; user: { name: string | null; email: string } | null } | null = null;

  if (input.token) {
    const sub = await prisma.eventFormSubmission.findUnique({ where: { checkInToken: input.token }, select: { id: true } });
    if (!sub) return blank;
    submissionId = sub.id;
  } else if (input.bookingId) {
    bookingInRoom = await prisma.workshopBooking.findFirst({
      where: { id: input.bookingId, workshopId: input.workshopId },
      select: { id: true, status: true, checkedInAt: true, submissionId: true, user: { select: { name: true, email: true } } },
    });
    if (!bookingInRoom) return blank;
    submissionId = bookingInRoom.submissionId;
  } else {
    return blank;
  }

  const [submission, seats, internalOf] = await Promise.all([
    submissionId
      ? prisma.eventFormSubmission.findUnique({ where: { id: submissionId }, select: { data: true, email: true } })
      : Promise.resolve(null),
    submissionId
      ? prisma.workshopBooking.findMany({
          where: { submissionId },
          select: {
            id: true, status: true, checkedInAt: true, workshopId: true,
            workshop: { select: { title: true, startDateTime: true } },
          },
        })
      : Promise.resolve([]),
    internalTest(),
  ]);
  const internal = internalOf({ submission: submission ?? null, user: bookingInRoom?.user ?? null });

  const here = bookingInRoom
    ? { id: bookingInRoom.id, status: bookingInRoom.status, checkedInAt: bookingInRoom.checkedInAt }
    : seats.find((s) => s.workshopId === input.workshopId) ?? null;

  const name =
    registrantName((submission?.data ?? {}) as Record<string, unknown>) ||
    bookingInRoom?.user?.name?.trim() ||
    submission?.email || bookingInRoom?.user?.email || "Unnamed registrant";
  const email = submission?.email ?? bookingInRoom?.user?.email ?? "";
  const otherSessions = seats
    .filter((s) => s.workshopId !== input.workshopId && s.status !== "cancelled")
    .sort((a, b) => a.workshop.startDateTime.getTime() - b.workshop.startDateTime.getTime())
    .map((s) => ({ title: s.workshop.title, when: when(s.workshop.startDateTime), status: s.status }));

  const card = (verdict: DoorVerdict, checkedInAt: Date | null, r = room): DoorCard => ({
    verdict, name, email, internal,
    status: here?.status ?? null,
    checkedInAt: checkedInAt ? checkedInAt.toISOString() : null,
    bookingId: here?.id ?? null,
    otherSessions,
    room: r,
  });

  const verdict = doorVerdict(
    here ? { status: here.status, checkedInAt: here.checkedInAt ? here.checkedInAt.toISOString() : null } : null,
    room,
  );

  const record = async () => {
    const at = new Date();
    // Only if nobody got there first: two phones scanning the same pass
    // at once record one check-in, and both say so truthfully.
    const wrote = await prisma.workshopBooking.updateMany({
      where: { id: here!.id, checkedInAt: null },
      data: { checkedInAt: at, checkedInById: input.adminId, checkInMethod: input.method },
    });
    if (wrote.count === 0) {
      const again = await prisma.workshopBooking.findUnique({ where: { id: here!.id }, select: { checkedInAt: true } });
      return card("already", again?.checkedInAt ?? null, await roomFacts(input.workshopId));
    }
    return card("checked_in", at, await roomFacts(input.workshopId));
  };

  if (verdict === "checked_in") return record();
  if (verdict === "can_let_in" && input.letIn) {
    // Counted again at the moment of letting in: the last chair may have
    // gone to somebody else in the seconds the card was on screen.
    const fresh = await roomFacts(input.workshopId);
    if (!hasSpace(fresh)) return card("full", null, fresh);
    return record();
  }
  return card(verdict, here?.checkedInAt ?? null);
}

/** Take a check-in back — the laptop's Undo, for a wrong click. */
export async function undoCheckIn(workshopId: string, bookingId: string) {
  await prisma.workshopBooking.updateMany({
    where: { id: bookingId, workshopId },
    data: { checkedInAt: null, checkedInById: null, checkInMethod: null },
  });
  return roomFacts(workshopId);
}

export interface RosterRow {
  bookingId: string;
  name: string;
  email: string;
  status: string;
  checkedInAt: string | null;
  method: string | null;
  internal: boolean;
}

/** Everybody with a seat in one session, for the laptop list. */
export async function sessionRoster(workshopId: string): Promise<{ rows: RosterRow[]; room: { capacity: number; checkedIn: number; internalIn: number } }> {
  const [bookings, room, internalOf] = await Promise.all([
    prisma.workshopBooking.findMany({
      where: { workshopId },
      select: {
        id: true, status: true, checkedInAt: true, checkInMethod: true,
        submission: { select: { data: true, email: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    roomFacts(workshopId),
    internalTest(),
  ]);
  const rows = bookings.map((b) => ({
    internal: internalOf({ submission: b.submission ?? null, user: b.user ?? null }),
    bookingId: b.id,
    name:
      registrantName((b.submission?.data ?? {}) as Record<string, unknown>) ||
      b.user?.name?.trim() || b.submission?.email || b.user?.email || "Unnamed registrant",
    email: b.submission?.email ?? b.user?.email ?? "",
    status: b.status,
    checkedInAt: b.checkedInAt ? b.checkedInAt.toISOString() : null,
    method: b.checkInMethod,
  }));
  rows.sort((a, b) => a.name.localeCompare(b.name));
  return { rows, room };
}

/* ── "I can't make it" ──────────────────────────────────────────── */

const TEAM = () => process.env.SMTP_FROM_EMAIL ?? "info@biohubnet.ca";
const ALSO = "engage@biohubnet.ca";

/**
 * A registrant releases their own seat, with a reason.
 *
 * The seat is freed at once (status "cancelled") so the room count and
 * the waitlist see it, and it is marked as told — the "declined" letter
 * a cancelled seat would otherwise owe is not what happened, and must
 * never go out on top of this. The team is emailed the reason so
 * somebody can offer the place on; the registrant gets the "place
 * released" letter as their receipt, which also takes the session back
 * out of their calendar.
 */
export async function withdrawSeat(input: { token: string; bookingId: string; reason: string }): Promise<
  { ok: true } | { ok: false; problem: string }
> {
  const problem = withdrawProblem(input.reason);
  if (problem) return { ok: false, problem };
  const reason = input.reason.trim();

  const sub = await prisma.eventFormSubmission.findUnique({
    where: { checkInToken: input.token },
    select: { id: true, data: true, email: true },
  });
  if (!sub) return { ok: false, problem: "This link is no longer active." };

  const seat = await prisma.workshopBooking.findFirst({
    where: { id: input.bookingId, submissionId: sub.id },
    select: {
      id: true, status: true, withdrawnAt: true, bookedAt: true,
      workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true } },
    },
  });
  if (!seat) return { ok: false, problem: "That session is not on your registration." };
  if (seat.withdrawnAt) return { ok: true }; // said twice is still said once
  if (seat.status === "cancelled") return { ok: false, problem: "You no longer have a place in this session." };

  const now = new Date();
  await prisma.workshopBooking.update({
    where: { id: seat.id },
    data: {
      status: "cancelled",
      withdrawnAt: now,
      withdrawReason: reason.slice(0, 2000),
      // Told — by themselves. Nothing further is owed on this seat.
      notifiedStatus: "cancelled",
      notifiedAt: now,
    },
  });

  const name = registrantName((sub.data ?? {}) as Record<string, unknown>) || sub.email || "A registrant";
  if (mailConfigured()) {
    await sendMail({
      to: TEAM(),
      cc: ALSO,
      replyTo: sub.email ?? undefined,
      signature: false,
      subject: `Training Week: ${name} can't make ${seat.workshop.title}`,
      text:
        `${name} (${sub.email ?? "no address"}) has released their place at ${seat.workshop.title}, ${when(seat.workshop.startDateTime)}.\n\n` +
        `Their reason:\n${reason}\n\n` +
        `The seat is free again. If somebody is waiting for it, offer it from Training admin → Registrants:\n` +
        `${absolute("/admin/workspace/training-admin?tab=registrants")}\n`,
    }).catch(() => { /* the seat is released either way; the admin page shows it */ });
  }

  await sendDecisionLetter("seat_released", {
    to: sub.email,
    name,
    session: seat.workshop.title,
    start: seat.workshop.startDateTime,
    end: seat.workshop.endDateTime,
    venue: seat.workshop.locationName,
    note: null,
    bookingId: seat.id,
    bookedAt: seat.bookedAt,
    decidedAt: now,
    calendar: "remove",
  }).catch(() => null);

  return { ok: true };
}
