import type { MailCalendar, sendMail } from "@/lib/mail";

type Message = Parameters<typeof sendMail>[0];

/**
 * One email per person: the letter, with a calendar file attached for
 * each session. Never a meeting invitation — Outlook turns the whole
 * email into a meeting request, and accepting it sends the letter (and
 * its cancel buttons) to Deleted Items. A plain .ics attachment leaves
 * the letter in the inbox and adds the session when it is opened.
 */
export function trainingWeekMessages(
  letter: Message,
  calendars: (MailCalendar & { title: string })[],
): Message[] {
  if (!calendars.length) return [letter];
  const note = calendars.length === 1
    ? "Open the attached calendar file to add this session to your calendar."
    : "Open the attached calendar files to add your sessions to your calendar, one file per session.";
  return [{
    ...letter,
    text: `${letter.text}\n\n${note}`,
    html: letter.html === undefined ? undefined : `${letter.html}<p>${note}</p>`,
    attachments: [
      ...(letter.attachments ?? []),
      // application/ics, not text/calendar: a text/calendar part is what mail clients read as an invitation.
      ...calendars.map((c) => ({ filename: c.filename, content: c.content, contentType: "application/ics" })),
    ],
  }];
}
