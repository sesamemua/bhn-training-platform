/**
 * HTML email template — event reminder.
 *
 * Shares the chrome with registration-confirmation.ts: header band,
 * status banner, event details card, CTA, footer. The status banner
 * and copy adapt to the reminder kind:
 *
 *   • "one_week" — "Save the date" tone, full event details, CTA to
 *     review your registration / add to calendar
 *   • "one_day"  — "Tomorrow" tone, abbreviated body, last-minute
 *     practical reminders (parking, gowning, dress code line if set)
 *   • "one_hour" — "Starting soon" tone, big QR or meeting link,
 *     minimal copy — they're about to head out the door
 */

import QRCode from "qrcode-svg";

export type ReminderKind = "one_week" | "one_day" | "one_hour";

export interface EventReminderInput {
  kind: ReminderKind;
  // Recipient
  recipientName: string | null;
  recipientEmail: string;
  // Event
  eventTitle: string;
  eventStart: Date;
  eventEnd: Date;
  eventTimezone: string;
  venueName: string | null;
  venueAddress: string | null;
  meetingUrl: string | null;
  isOnline: boolean;
  // Registration
  qrToken: string;
  // Public surfaces
  eventPageUrl: string;
  successPageUrl: string;
  contactEmail: string;
}

export interface EventReminderOutput {
  subject: string;
  text: string;
  html: string;
}

const COLOR = {
  brand:    "#3b6cef",
  brand900: "#0b1b3b",
  brand50:  "#eef2ff",
  fg:       "#0f172a",
  fgMuted:  "#475569",
  fgSubtle: "#94a3b8",
  bg:       "#f8fafc",
  card:     "#ffffff",
  line:     "#e2e8f0",
  emerald:  "#10b981",
  amber:    "#f59e0b",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function kindMeta(kind: ReminderKind, title: string) {
  switch (kind) {
    case "one_week":
      return {
        accent: COLOR.brand,
        accentTint: COLOR.brand50,
        eyebrow: "One week to go",
        heading: `${title} is one week away`,
        body:
          `Heads up — we're seven days out. Save the date in your calendar ` +
          `if you haven't already, and we'll see you soon.`,
        subject: `One week — ${title}`,
        showQr: false,
      };
    case "one_day":
      return {
        accent: COLOR.amber,
        accentTint: "#fef3c7",
        eyebrow: "Tomorrow",
        heading: `${title} is tomorrow`,
        body:
          `Last reminder before the day. Bring this email — the QR below ` +
          `is your check-in pass. Practical details are in the card on the right.`,
        subject: `Tomorrow — ${title}`,
        showQr: true,
      };
    case "one_hour":
      return {
        accent: COLOR.emerald,
        accentTint: "#d1fae5",
        eyebrow: "Starting soon",
        heading: `${title} starts in about an hour`,
        body:
          `We're starting in about an hour. Open the QR below to check in, ` +
          `or click through to the meeting link if it's online.`,
        subject: `Starting soon — ${title}`,
        showQr: true,
      };
  }
}

function formatDateRange(start: Date, end: Date, tz: string): string {
  const sameDay =
    start.toLocaleDateString("en-CA", { timeZone: tz }) ===
    end.toLocaleDateString("en-CA", { timeZone: tz });
  if (sameDay) {
    const date = start.toLocaleDateString("en-CA", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: tz,
    });
    const t = (x: Date) =>
      x.toLocaleTimeString("en-CA", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: tz,
      });
    return `${date} · ${t(start)} – ${t(end)}`;
  }
  return `${start.toLocaleString("en-CA", { dateStyle: "long", timeStyle: "short", timeZone: tz })} – ${end.toLocaleString("en-CA", { dateStyle: "long", timeStyle: "short", timeZone: tz })}`;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEventReminder(input: EventReminderInput): EventReminderOutput {
  const meta = kindMeta(input.kind, input.eventTitle);
  const greeting = input.recipientName
    ? `Hi ${input.recipientName.split(/\s+/)[0]},`
    : "Hi,";

  let qrDataUrl: string | null = null;
  if (meta.showQr) {
    const qrSvg = new QRCode({
      content: input.qrToken,
      width: 200,
      height: 200,
      padding: 0,
      color: COLOR.brand900,
      background: "#ffffff",
      ecl: "M",
    }).svg();
    qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;
  }

  const venueLine = input.isOnline
    ? `Online${input.venueName && input.venueName !== "Online" ? ` · ${input.venueName}` : ""}`
    : input.venueName ?? "TBA";

  const text =
    `${greeting}\n\n` +
    `${meta.heading}.\n\n` +
    `${meta.body}\n\n` +
    `When: ${formatDateRange(input.eventStart, input.eventEnd, input.eventTimezone)}\n` +
    `Where: ${venueLine}` +
    (input.venueAddress && !input.isOnline ? `\n${input.venueAddress}` : "") +
    (input.isOnline && input.meetingUrl ? `\nMeeting link: ${input.meetingUrl}` : "") +
    "\n\n" +
    (meta.showQr ? `Your check-in code: ${input.qrToken}\n\n` : "") +
    `View your registration: ${input.successPageUrl}\n\n` +
    `Questions? Reply to this email or contact the BHN team at ${input.contactEmail}.\n\n` +
    `— BioHubNet`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bg};font-family:${FONT_STACK};color:${COLOR.fg};-webkit-font-smoothing:antialiased;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.bg};padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:${COLOR.card};border-radius:18px;overflow:hidden;border:1px solid ${COLOR.line};box-shadow:0 4px 18px rgba(15,23,42,0.06);">

        <tr><td style="background:linear-gradient(135deg, ${COLOR.brand900}, ${COLOR.brand} 75%);padding:30px 36px 26px 36px;text-align:left;">
          <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.78);font-weight:700;font-family:Menlo,Consolas,monospace;">
            ${esc(formatDateRange(input.eventStart, input.eventEnd, input.eventTimezone))}
          </p>
          <h1 style="margin:8px 0 0 0;font-size:26px;line-height:1.18;color:#ffffff;font-weight:700;letter-spacing:-0.01em;">
            ${esc(input.eventTitle)}
          </h1>
        </td></tr>

        <tr><td style="padding:0 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:-18px 0 0 0;">
            <tr><td style="background:${meta.accentTint};border:1px solid ${meta.accent}33;border-radius:14px;padding:14px 18px;">
              <p style="margin:0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${meta.accent};font-weight:700;">
                ${esc(meta.eyebrow)}
              </p>
              <p style="margin:4px 0 0 0;font-size:15px;line-height:1.4;color:${COLOR.fg};font-weight:600;">
                ${esc(meta.heading)}
              </p>
            </td></tr>
          </table>
        </td></tr>

        <tr><td style="padding:24px 36px 12px 36px;">
          <p style="margin:0 0 12px 0;font-size:15px;color:${COLOR.fg};">${esc(greeting)}</p>
          <p style="margin:0;font-size:14.5px;line-height:1.55;color:${COLOR.fgMuted};">${esc(meta.body)}</p>
        </td></tr>

        <tr><td style="padding:18px 36px 6px 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.bg};border:1px solid ${COLOR.line};border-radius:14px;padding:18px 20px;">
            <tr>
              <td width="64" valign="top" style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.fgSubtle};font-weight:700;padding:0 0 6px 0;">When</td>
              <td valign="top" style="font-size:14px;color:${COLOR.fg};padding:0 0 6px 0;">
                ${esc(formatDateRange(input.eventStart, input.eventEnd, input.eventTimezone))}
              </td>
            </tr>
            <tr>
              <td valign="top" style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.fgSubtle};font-weight:700;padding:0 0 6px 0;">Where</td>
              <td valign="top" style="font-size:14px;color:${COLOR.fg};padding:0 0 6px 0;">
                ${esc(venueLine)}
                ${input.venueAddress && !input.isOnline ? `<br><span style="font-size:13px;color:${COLOR.fgMuted};font-family:Menlo,Consolas,monospace;">${esc(input.venueAddress)}</span>` : ""}
                ${input.isOnline && input.meetingUrl ? `<br><a href="${esc(input.meetingUrl)}" style="color:${COLOR.brand};text-decoration:none;font-weight:600;">Open meeting link →</a>` : ""}
              </td>
            </tr>
          </table>
        </td></tr>

        ${qrDataUrl ? `
        <tr><td style="padding:18px 36px 6px 36px;text-align:center;">
          <p style="margin:0 0 12px 0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${COLOR.fgSubtle};font-weight:700;">Your check-in pass</p>
          <img src="${qrDataUrl}" alt="QR check-in code: ${esc(input.qrToken)}" width="200" height="200" style="display:block;margin:0 auto;border-radius:12px;background:#ffffff;" />
          <p style="margin:10px 0 0 0;font-size:12px;line-height:1.5;color:${COLOR.fgSubtle};font-family:Menlo,Consolas,monospace;word-break:break-all;max-width:320px;margin-left:auto;margin-right:auto;">
            ${esc(input.qrToken)}
          </p>
        </td></tr>` : ""}

        <tr><td style="padding:22px 36px 28px 36px;text-align:center;">
          <a href="${esc(input.successPageUrl)}" style="display:inline-block;padding:12px 26px;background:${COLOR.brand};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;">
            View your registration
          </a>
        </td></tr>

        <tr><td style="padding:20px 36px 28px 36px;border-top:1px solid ${COLOR.line};text-align:center;background:${COLOR.bg};">
          <p style="margin:0;font-size:12px;color:${COLOR.fgMuted};line-height:1.6;">
            Questions? Reply to this email or contact us at
            <a href="mailto:${esc(input.contactEmail)}" style="color:${COLOR.brand};text-decoration:none;">${esc(input.contactEmail)}</a>.
          </p>
          <p style="margin:10px 0 0 0;font-size:11px;color:${COLOR.fgSubtle};letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">BioHubNet</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject: meta.subject, text, html };
}
