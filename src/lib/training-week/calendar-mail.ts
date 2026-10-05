import type { MailCalendar, sendMail } from "@/lib/mail";

type Message = Parameters<typeof sendMail>[0];

/** One native invitation per email; mixing invites and a QR breaks client recognition. */
export function trainingWeekMessages(
  letter: Message,
  calendars: (MailCalendar & { title: string })[],
): Message[] {
  if (!calendars.length) return [letter];
  const note = "Your calendar invitations or updates will arrive in separate emails, one per session.";
  return [
    {
      ...letter,
      text: `${letter.text}\n\n${note}`,
      html: letter.html === undefined ? undefined : `${letter.html}<p>${note}</p>`,
    },
    ...calendars.map(({ title, ...icalEvent }): Message => ({
      to: letter.to,
      subject: `${icalEvent.method === "CANCEL" ? "Calendar cancellation" : "Calendar invitation"}: ${title}`.replace(/[\r\n]+/g, " "),
      text: icalEvent.method === "CANCEL"
        ? `This session has been removed from your Training Week schedule: ${title}.\n\n${letter.text}`
        : `Add this Training Week session to your calendar using your email app's calendar controls or the attached .ics file.\n\n${letter.text}`,
      icalEvent,
      signature: false,
    })),
  ];
}
