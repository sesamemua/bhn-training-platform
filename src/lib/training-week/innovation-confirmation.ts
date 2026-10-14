/**
 * Innovation Ignited approves on registration: the seat the form just
 * made is confirmed (or waitlisted, if the room is full), and the
 * registrant gets their confirmation — not the generic "we have your
 * registration" letter — with the calendar file and a withdraw button.
 *
 * Only ever called for a registration that has just been made, so seats
 * from before this existed are never touched.
 */
import "server-only";
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { calendarFor } from "@/lib/formbuilder/acknowledge";
import type { Receipt } from "@/lib/formbuilder/receipt";
import { cantAttendUrl, passTokenFor } from "./pass";
import { trainingWeekMessages } from "./calendar-mail";
import { letterHtml } from "./letter-html";
import { dietarySaid, innovationLetter } from "./innovation-letter";

export async function confirmInnovationRegistration(submissionId: string, answers: Record<string, unknown>, to: string | null): Promise<Receipt> {
  const seat = await prisma.workshopBooking.findFirst({
    where: { submissionId, status: "pending" },
    select: { id: true, workshop: { select: { id: true, capacity: true } } },
  });
  if (!seat) return { state: "no-template" };

  // A seat if the room has one; otherwise the waitlist.
  const taken = await prisma.workshopBooking.count({ where: { workshopId: seat.workshop.id, status: "confirmed" } });
  const status = taken < seat.workshop.capacity ? "confirmed" : "waitlist";
  await prisma.workshopBooking.update({ where: { id: seat.id }, data: { status, ...(status === "confirmed" ? { approvedAt: new Date() } : {}) } });
  return sendInnovationConfirmation(seat.id, answers, to);
}

/**
 * The confirmation (or waitlist note) for one Innovation Ignited seat, as it stands now —
 * sent, kept in the person's history, and the seat marked as told.
 */
export async function sendInnovationConfirmation(seatId: string, answers: Record<string, unknown>, to: string | null, byName?: string): Promise<Receipt> {
  const seat = await prisma.workshopBooking.findUnique({
    where: { id: seatId },
    select: { id: true, status: true, submissionId: true, bookedAt: true, approvedAt: true, workshop: { select: { title: true, startDateTime: true, endDateTime: true, locationName: true } } },
  });
  if (!seat || !seat.submissionId || (seat.status !== "confirmed" && seat.status !== "waitlist")) return { state: "no-template" };
  if (!to) return { state: "no-address" };
  const status = seat.status;
  const name = typeof answers.full_name === "string" ? answers.full_name : "";
  const token = status === "confirmed" ? await passTokenFor(seat.submissionId) : null;
  const letter = innovationLetter({
    name, status, session: seat.workshop.title,
    start: seat.workshop.startDateTime, end: seat.workshop.endDateTime, venue: seat.workshop.locationName,
    cantAttendLink: token ? cantAttendUrl(token, seat.id) : undefined,
    dietary: dietarySaid(answers),
  });
  const preview = { to, subject: letter.subject, body: letter.body };
  if (!mailConfigured()) return { state: "not-configured", preview };

  const calendars = status === "confirmed"
    ? calendarFor({ to, name, session: seat.workshop.title, start: seat.workshop.startDateTime, end: seat.workshop.endDateTime, venue: seat.workshop.locationName, bookingId: seat.id, bookedAt: seat.bookedAt, decidedAt: seat.approvedAt ?? new Date(), calendar: "add" }) ?? []
    : [];
  const messages = trainingWeekMessages({ to, subject: letter.subject, text: letter.body, html: letterHtml(letter.body, letter.buttons) }, calendars);
  try {
    for (const m of messages) await sendMail({ ...m, log: { kind: "Innovation Ignited confirmation", byName: byName ?? null } });
  } catch (err) {
    return { state: "failed", why: (err as Error)?.message ?? "unknown", preview };
  }
  // Told: nothing more is owed on this seat, so it does not sit in the mailbox.
  await prisma.workshopBooking.update({ where: { id: seat.id }, data: { notifiedStatus: status, notifiedAt: new Date() } });
  return { state: "sent", preview };
}
