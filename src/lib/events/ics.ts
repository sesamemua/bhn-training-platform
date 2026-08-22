/**
 * RFC 5545 .ics file builder.
 *
 * Used in two places:
 *   1. Attached to the registration confirmation email so attendees
 *      can one-click "Add to Calendar" in any calendar app (Apple,
 *      Google, Outlook desktop, Linux Thunderbird, etc.).
 *   2. Served standalone at `/events/<slug>/calendar.ics` — powers
 *      the "Apple / iCal (.ics)" entry in the AddToCalendar dropdown.
 *
 * The output is plain text with CRLF line endings (RFC-mandated).
 * Lines longer than 75 octets fold with a CRLF + leading space. Text
 * fields escape `,`, `;`, `\`, and newline characters per spec.
 *
 * The ORGANIZER + ATTENDEE properties make this a proper invitation
 * rather than a one-sided event — Apple Mail and Outlook will offer
 * Accept / Decline buttons.
 *
 * `cancel` emits the withdrawal form: same UID, METHOD:CANCEL, a higher
 * SEQUENCE. That is what removes an entry from somebody's calendar
 * rather than leaving a second one beside it.
 */

export interface IcsEventInput {
  /** Stable UID for the calendar event. Use eventId + (registrationId
   *  if registrant-specific) so cancellations / updates re-key
   *  correctly. Suffix should be `@biohubnet.ca`. */
  uid: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start: Date;
  end: Date;
  /** Public URL of the event landing page. */
  url?: string | null;
  /** Sender — usually `info@biohubnet.ca`. */
  organizerEmail: string;
  organizerName?: string;
  /** Optional recipient (drives the ATTENDEE line). Skip for the
   *  public standalone download. */
  attendeeEmail?: string;
  attendeeName?: string;
  /** Increment when the event details change (RFC 5545 SEQUENCE). */
  sequence?: number;
  /**
   * Withdraw a calendar entry that was already sent.
   *
   * A seat can be approved and later declined — a coordinator changing
   * their mind is a designed part of the process — and without this the
   * session sits in somebody's calendar for ever, so they turn up.
   *
   * A cancellation is the SAME UID with METHOD:CANCEL and a higher
   * SEQUENCE; that is what tells a calendar to remove the entry rather
   * than add a second one.
   */
  cancel?: boolean;
}

const CRLF = "\r\n";

/** Format a Date as RFC 5545 UTC `YYYYMMDDTHHmmssZ`. */
function toIcsUtc(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear().toString() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    "T" +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes()) +
    p(d.getUTCSeconds()) +
    "Z"
  );
}

/** Escape commas, semicolons, backslashes, and newlines per RFC 5545
 *  text-value rules. */
function escText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** Fold lines >75 octets per RFC 5545 §3.1. Conservative byte count
 *  uses UTF-8 byte length so multibyte characters don't break the
 *  rule. Continuation lines begin with a single space. */
function foldLine(line: string): string {
  const enc = new TextEncoder();
  const bytes = enc.encode(line);
  if (bytes.length <= 75) return line;
  const dec = new TextDecoder();
  const out: string[] = [];
  let cursor = 0;
  while (cursor < bytes.length) {
    // Per spec, max 75 octets per line (the continuation space
    // counts toward the next line's quota, so subsequent chunks
    // get 74 octets of payload).
    const limit = out.length === 0 ? 75 : 74;
    let end = Math.min(cursor + limit, bytes.length);
    // Don't split a multibyte char — trim back to a UTF-8 boundary.
    while (end > cursor && (bytes[end] & 0xc0) === 0x80) end--;
    out.push(dec.decode(bytes.slice(cursor, end)));
    cursor = end;
  }
  return out.join(CRLF + " ");
}

export function buildIcs(input: IcsEventInput): string {
  const now = new Date();
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BioHubNet//Events//EN",
    input.cancel ? "METHOD:CANCEL" : "METHOD:REQUEST",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.uid}`,
    `DTSTAMP:${toIcsUtc(now)}`,
    `DTSTART:${toIcsUtc(input.start)}`,
    `DTEND:${toIcsUtc(input.end)}`,
    `SUMMARY:${escText(input.title)}`,
  ];
  if (input.description) lines.push(`DESCRIPTION:${escText(input.description)}`);
  if (input.location)    lines.push(`LOCATION:${escText(input.location)}`);
  if (input.url)         lines.push(`URL:${input.url}`);

  // Organiser — RFC 5545 wants `mailto:<addr>` in the value, with the
  // display name in the CN parameter.
  const orgCn = input.organizerName ? `;CN=${escText(input.organizerName)}` : "";
  lines.push(`ORGANIZER${orgCn}:mailto:${input.organizerEmail}`);

  // Attendee — optional; without it the .ics still imports, just no
  // RSVP affordance.
  if (input.attendeeEmail) {
    const cn = input.attendeeName ? `;CN=${escText(input.attendeeName)}` : "";
    lines.push(
      `ATTENDEE${cn};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${input.attendeeEmail}`,
    );
  }
  lines.push(
    `SEQUENCE:${input.sequence ?? 0}`,
    input.cancel ? "STATUS:CANCELLED" : "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  );
  return lines.map(foldLine).join(CRLF) + CRLF;
}
