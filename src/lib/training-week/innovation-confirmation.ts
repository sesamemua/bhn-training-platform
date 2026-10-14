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
    select: { id: true, bookedAt: true, workshop: { select: { id: true, title: true, capacity: true, startDateTime: true, endDateTime: true, locationName: true } } },
  });
  if (!seat) return { state: "no-template" };

  // A seat if the room has one; otherwise the waitlist.
  const taken = await prisma.workshopBooking.count({ where: { workshopId: seat.workshop.id, status: "confirmed" } });
  const status = taken < seat.workshop.capacity ? "confirmed" : "waitlist";
  const now = new Date();
  await prisma.workshopBooking.update({ where: { id: seat.id }, data: { status, ...(status === "confirmed" ? { approvedAt: now } : {}) } });

  if (!to) return { state: "no-address" };
  const name = typeof answers.full_name === "string" ? answers.full_name : "";
  const token = status === "confirmed" ? await passTokenFor(submissionId) : null;
  const letter = innovationLetter({
    name, status, session: seat.workshop.title,
    start: seat.workshop.startDateTime, end: seat.workshop.endDateTime, venue: seat.workshop.locationName,
    cantAttendLink: token ? cantAttendUrl(token, seat.id) : undefined,
    dietary: dietarySaid(answers),
  });
  const preview = { to, subject: letter.subject, body: letter.body };
  if (!mailConfigured()) return { state: "not-configured", preview };

  const calendars = status === "confirmed"
    ? calendarFor({ to, name, session: seat.workshop.title, start: seat.workshop.startDateTime, end: seat.workshop.endDateTime, venue: seat.workshop.locationName, bookingId: seat.id, bookedAt: seat.bookedAt, decidedAt: now, calendar: "add" }) ?? []
    : [];
  const messages = trainingWeekMessages({ to, subject: letter.subject, text: letter.body, html: letterHtml(letter.body, letter.buttons) }, calendars);
  try {
    for (const m of messages) await sendMail({ ...m, log: { kind: "Innovation Ignited confirmation (automatic)" } });
  } catch (err) {
    return { state: "failed", why: (err as Error)?.message ?? "unknown", preview };
  }
  // Told: nothing more is owed on this seat, so it does not sit in the mailbox.
  await prisma.workshopBooking.update({ where: { id: seat.id }, data: { notifiedStatus: status, notifiedAt: new Date() } });
  return { state: "sent", preview };
}
