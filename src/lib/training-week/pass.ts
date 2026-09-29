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
import { doorVerdict, hasSpace, type DoorVerdict } from "./check-in";

/** The pass page for a code. */
export const passUrl = (token: string) => absolute(`/training-week/pass/${token}`);

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
  room: { checkedIn: number; capacity: number };
}

async function roomFacts(workshopId: string) {
  const [w, checkedIn] = await Promise.all([
    prisma.workshop.findUnique({ where: { id: workshopId }, select: { capacity: true } }),
    prisma.workshopBooking.count({ where: { workshopId, checkedInAt: { not: null } } }),
  ]);
  return { capacity: w?.capacity ?? 0, checkedIn };
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
    verdict: "unknown", name: "", email: "", status: null, checkedInAt: null, bookingId: null, otherSessions: [], room,
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

  const [submission, seats] = await Promise.all([
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
  ]);

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
    verdict, name, email,
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
}

/** Everybody with a seat in one session, for the laptop list. */
export async function sessionRoster(workshopId: string): Promise<{ rows: RosterRow[]; room: { capacity: number; checkedIn: number } }> {
  const [bookings, room] = await Promise.all([
    prisma.workshopBooking.findMany({
      where: { workshopId },
      select: {
        id: true, status: true, checkedInAt: true, checkInMethod: true,
        submission: { select: { data: true, email: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    roomFacts(workshopId),
  ]);
  const rows = bookings.map((b) => ({
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
