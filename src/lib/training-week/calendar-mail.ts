import type { MailCalendar, sendMail } from "@/lib/mail";

type Message = Parameters<typeof sendMail>[0];

/**
 * One email per person, whatever it carries. A single session rides in it
 * as a native invitation (a mail client recognises one per message);
 * several go as .ics files attached to the same letter, one per session,
 * so nobody gets a trail of separate calendar emails.
 */
export function trainingWeekMessages(
  letter: Message,
  calendars: (MailCalendar & { title: string })[],
): Message[] {
  if (!calendars.length) return [letter];
  if (calendars.length === 1) {
    const { title: _title, ...icalEvent } = calendars[0];
    return [{ ...letter, icalEvent }];
  }
  const note = "The attached calendar files add your sessions to your calendar, one file per session.";
  return [{
    ...letter,
    text: `${letter.text}\n\n${note}`,
    html: letter.html === undefined ? undefined : `${letter.html}<p>${note}</p>`,
    attachments: [
      ...(letter.attachments ?? []),
      ...calendars.map((c) => ({ filename: c.filename, content: c.content, contentType: `text/calendar; charset=utf-8; method=${c.method}` })),
    ],
  }];
}
