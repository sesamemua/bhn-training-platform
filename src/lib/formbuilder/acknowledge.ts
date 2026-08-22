import "server-only";

/**
 * The "we have your registration" letter, sent from one place.
 *
 * Both submit paths — the coordinator testing from Admin and a
 * registrant on the public page — send the SAME letter, because
 * "what the test sent" and "what a registrant gets" being different
 * makes the test worthless.
 *
 * The wording is the `received` template, edited under Admin → Email →
 * Standing letters. A coordinator who changes the turnaround there and
 * finds registrants still being told the old number would rightly never
 * trust the editor again.
 */
import { prisma } from "@/lib/prisma";
import { mailConfigured, sendMail } from "@/lib/mail";
import { parseOverrides, render, resolveTemplates, TEMPLATES_KEY } from "@/lib/allocation/email-templates";
import type { Answers } from "./logic";
import type { Receipt } from "./receipt";
import type { BuiltForm } from "./types";
import { buildIcs } from "@/lib/events/ics";

export async function sendAcknowledgement(
  doc: BuiltForm,
  answers: Answers,
  opts: { to: string | null; asTest?: boolean },
): Promise<Receipt> {
  if (!opts.to) return { state: "no-address" };

  const stored = await prisma.platformSetting
    .findUnique({ where: { key: TEMPLATES_KEY } })
    .catch(() => null);
  const template = resolveTemplates(parseOverrides(stored?.value)).find((t) => t.id === "received");
  if (!template) return { state: "no-template" };

  const name = String(answers.first_name ?? answers.trainee_name ?? "").trim();
  const vars = {
    first_name: name.split(/\s+/)[0] || "there",
    name: name || "there",
    event: "BioHubNet Training Week 2026",
    coordinator: "The BioHubNet team",
  };
  const subject = render(template.subject, vars);
  const body = render(template.body, vars);
  // A letter with an unfilled placeholder is worse than no letter: it
  // is the platform telling somebody it does not know who they are.
  if (subject.missing.length > 0 || body.missing.length > 0) {
    return { state: "unfilled", missing: [...new Set([...subject.missing, ...body.missing])] };
  }

  const preview = {
    to: opts.to,
    // A newline in a subject is a header break, and the name in it came
    // from a text box on a page anybody can open.
    subject: subject.text.replace(/[\r\n]+/g, " ").trim(),
    body: body.text,
  };
  if (!mailConfigured()) return { state: "not-configured", preview };

  try {
    await sendMail({ to: opts.to, subject: preview.subject, text: preview.body });
    return { state: opts.asTest ? "sent-to-you" : "sent", preview };
  } catch (err) {
    // The row is already written. A registration is not lost because
    // the mail server is having a bad afternoon.
    return { state: "failed", why: (err as Error)?.message ?? "unknown", preview };
  }
}

/**
 * A letter about a decision on one seat.
 *
 * Same machinery as the acknowledgement — the wording is whatever the
 * standing letter says, so a coordinator who rewrites the decline in
 * Admin changes what gets sent — but with the session's own details
 * filled in, which is the difference between "your place" and "your
 * place at the CCRM tour on Monday at 11".
 */
export async function sendDecisionLetter(
  templateId: string,
  about: {
    to: string | null;
    name: string;
    session: string;
    start: Date;
    end: Date;
    venue: string | null;
    /** The coordinator's own words, appended if they wrote any. */
    note: string | null;
    /** The seat, so its calendar entry keeps a stable identity. */
    bookingId?: string;
    /** When the seat was first asked for — the base of the SEQUENCE. */
    bookedAt?: Date;
    /** When this decision was taken. */
    decidedAt?: Date;
    /**
     * The letter carries a calendar entry.
     *
     *   "add"    — an approval: here is the session, put it in.
     *   "remove" — a seat that WAS approved and no longer is. Without
     *              this the session sits in their calendar for ever
     *              and they turn up to a room with no place for them.
     *   undefined — no calendar entry either way.
     */
    calendar?: "add" | "remove";
  },
): Promise<Receipt> {
  if (!about.to) return { state: "no-address" };

  const stored = await prisma.platformSetting
    .findUnique({ where: { key: TEMPLATES_KEY } })
    .catch(() => null);
  const template = resolveTemplates(parseOverrides(stored?.value)).find((t) => t.id === templateId);
  if (!template) return { state: "no-template" };

  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Toronto", weekday: "long", day: "numeric", month: "long",
  }).format(about.start);
  const clock = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", { timeZone: "America/Toronto", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

  const vars = {
    first_name: about.name.split(/\s+/)[0] || "there",
    name: about.name || "there",
    event: "BioHubNet Training Week 2026",
    session: about.session,
    session_date: day,
    session_time: `${clock(about.start)}–${clock(about.end)}`,
    session_venue: about.venue || "to be confirmed",
    coordinator: "The BioHubNet team",
  };
  const subject = render(template.subject, vars);
  const body = render(template.body, vars);
  if (subject.missing.length > 0 || body.missing.length > 0) {
    return { state: "unfilled", missing: [...new Set([...subject.missing, ...body.missing])] };
  }

  const preview = {
    to: about.to,
    subject: subject.text.replace(/[\r\n]+/g, " ").trim(),
    // The coordinator's note goes at the END, under its own line, so a
    // reader can tell the standing wording from the personal part.
    body: about.note ? `${body.text}\n\n—\n${about.note}` : body.text,
  };
  if (!mailConfigured()) return { state: "not-configured", preview };

  try {
    await sendMail({
      to: about.to,
      subject: preview.subject,
      text: preview.body,
      attachments: calendarFor(about),
    });
    return { state: "sent", preview };
  } catch (err) {
    return { state: "failed", why: (err as Error)?.message ?? "unknown", preview };
  }
}

/**
 * The .ics to hang off a decision letter, if any.
 *
 * The UID is the SEAT, so every letter about the same seat updates one
 * calendar entry rather than leaving a trail of them. SEQUENCE has to
 * rise for a calendar to accept a change, and seconds-since-booked
 * gives that for free: a later decision on the same seat always has a
 * later `decidedAt`, so the number can only go up.
 */
function calendarFor(about: {
  to: string | null;
  name: string;
  session: string;
  start: Date;
  end: Date;
  venue: string | null;
  bookingId?: string;
  bookedAt?: Date;
  decidedAt?: Date;
  calendar?: "add" | "remove";
}) {
  if (!about.calendar || !about.bookingId || !about.to) return undefined;

  const seconds = about.bookedAt && about.decidedAt
    ? Math.max(0, Math.floor((about.decidedAt.getTime() - about.bookedAt.getTime()) / 1000))
    : 0;

  const ics = buildIcs({
    uid: `seat-${about.bookingId}@biohubnet.ca`,
    title: `${about.session} — BioHubNet Training Week`,
    description: about.calendar === "add"
      ? "Your place at this session is confirmed. About a week before, we will email to ask whether you can still make it — a reply holds your seat."
      : "This session has been removed from your Training Week schedule.",
    location: about.venue,
    start: about.start,
    end: about.end,
    organizerEmail: process.env.SMTP_FROM_EMAIL ?? "info@biohubnet.ca",
    organizerName: "BioHubNet",
    attendeeEmail: about.to,
    attendeeName: about.name || undefined,
    sequence: seconds,
    cancel: about.calendar === "remove",
  });

  return [{
    filename: "training-week.ics",
    content: ics,
    // The type matters more than the extension: Apple Mail and Outlook
    // decide whether to offer "Add to calendar" from this, not from the
    // filename.
    contentType: `text/calendar; charset=utf-8; method=${about.calendar === "remove" ? "CANCEL" : "REQUEST"}`,
  }];
}
