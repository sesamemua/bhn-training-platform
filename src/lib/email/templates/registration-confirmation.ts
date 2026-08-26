/**
 * HTML email template — registration confirmation.
 *
 * Produces { subject, text, html } for the registration-confirmation
 * email. Three status variants:
 *   • registered  — confirmed, the spot is held
 *   • waitlisted  — event full, on the waitlist with a position
 *   • pending     — event requires admin approval
 *
 * Design constraints (email-client compatibility, not a webpage):
 *   • Inline CSS only. Gmail strips <style> in many cases. Outlook
 *     desktop is stuck on a Word renderer that hates most modern CSS.
 *   • Table-based layout for structural compatibility.
 *   • System fonts via the safe-fallback stack — no custom webfonts.
 *   • Max ~600 px wide for desktop readability + mobile responsive
 *     via the viewport meta tag.
 *   • QR code as inline SVG data URL — Apple Mail + Gmail + Outlook
 *     web all render `data:image/svg+xml;base64,...`; older Outlook
 *     desktop falls back to alt text (also fine — the qrToken hex
 *     string is included as plain-text below the QR).
 */

import QRCode from "qrcode-svg";

export interface RegistrationConfirmationInput {
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

  // Registration state
  qrToken: string;
  status: "registered" | "waitlisted" | "pending";
  waitlistPosition: number | null;

  // Workshop picks (signed-in users only; empty for guests)
  workshopLines: string[];

  // Public surfaces
  eventPageUrl: string;
  successPageUrl: string;
  /** Contact email for questions (typically info@biohubnet.ca). */
  contactEmail: string;
}

export interface RegistrationConfirmationOutput {
  subject: string;
  text: string;
  html: string;
}

// ── Tokens shared with the existing brand. Hardcoded here so the
// template doesn't depend on CSS variables (which don't resolve in
// email clients). Sourced from globals.css's brand-* palette.
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
  rose:     "#e11d48",
};

const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// Status copy + colour tokens that drive the banner + subject line.
function statusMeta(input: RegistrationConfirmationInput) {
  switch (input.status) {
    case "waitlisted":
      return {
        accent: COLOR.amber,
        accentTint: "#fef3c7",
        eyebrow: "Waitlisted",
        heading: `You're on the waitlist for ${input.eventTitle}`,
        body:
          `The event is currently full, so you're on the waitlist at ` +
          `<strong>position #${input.waitlistPosition ?? "?"}</strong>. ` +
          `We'll email you the moment a seat opens — usually when someone cancels.`,
        subject: `Waitlisted — ${input.eventTitle} (position #${input.waitlistPosition ?? "?"})`,
      };
    case "pending":
      return {
        accent: COLOR.brand,
        accentTint: COLOR.brand50,
        eyebrow: "Pending approval",
        heading: `Thanks for registering for ${input.eventTitle}`,
        body:
          `Your registration is <strong>pending admin approval</strong>. ` +
          `Your spot is not guaranteed until the BHN events team confirms it — we'll email you ` +
          `as soon as it's been reviewed.`,
        subject: `Registration received — ${input.eventTitle} (pending approval)`,
      };
    default:
      return {
        accent: COLOR.emerald,
        accentTint: "#d1fae5",
        eyebrow: "You're registered",
        heading: `You're in — see you at ${input.eventTitle}`,
        body:
          `Your seat is confirmed. Save this email — the QR code below is your check-in pass.`,
        subject: `You're registered for ${input.eventTitle}`,
      };
  }
}

/** Format Date in event TZ as a readable string like
 *  "Wednesday, December 17, 2025 · 7:00 PM EST". */
function formatDateTime(d: Date, tz: string): string {
  return d.toLocaleString("en-CA", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: tz,
    timeZoneName: "short",
  });
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
  return `${formatDateTime(start, tz)} – ${formatDateTime(end, tz)}`;
}

/** Tiny HTML-escape helper for user-content fields. Email bodies
 *  occasionally embed names + addresses straight from the registration
 *  form, so we escape the obvious XSS vectors even though most email
 *  clients sandbox the body anyway. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderRegistrationConfirmation(
  input: RegistrationConfirmationInput,
): RegistrationConfirmationOutput {
  const meta = statusMeta(input);
  const greeting = input.recipientName
    ? `Hi ${input.recipientName.split(/\s+/)[0]},`
    : "Hi,";

  // ── QR code as inline SVG data URL ────────────────────────────
  // qrcode-svg returns a plain <svg ...> string; base64 + data URL
  // gives us a self-contained inline <img> the email client renders
  // without fetching external resources.
  const qrSvg = new QRCode({
    content: input.qrToken,
    width: 200,
    height: 200,
    padding: 0,
    color: COLOR.brand900,
    background: "#ffffff",
    ecl: "M",
  }).svg();
  const qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

  // ── Plain-text fallback (preserved & extended from previous flow) ─
  const venueLine = input.isOnline
    ? `Online${input.venueName && input.venueName !== "Online" ? ` · ${input.venueName}` : ""}`
    : input.venueName ?? "TBA";
  const addressLine = input.venueAddress && !input.isOnline ? `\n${input.venueAddress}` : "";
  const meetingLine = input.isOnline && input.meetingUrl
    ? `\nMeeting link: ${input.meetingUrl}`
    : "";
  const workshopBlock = input.workshopLines.length
    ? `\nYour workshop picks:\n${input.workshopLines.join("\n")}\n`
    : "";

  const text =
    `${greeting}\n\n` +
    `${meta.heading.replace(/<\/?strong>/g, "")}.\n\n` +
    `${meta.body.replace(/<\/?strong>/g, "").replace(/<br\s*\/?>/gi, "\n")}\n\n` +
    `When: ${formatDateRange(input.eventStart, input.eventEnd, input.eventTimezone)}\n` +
    `Where: ${venueLine}${addressLine}${meetingLine}\n` +
    workshopBlock +
    `\nYour check-in code: ${input.qrToken}\n` +
    `(Admins scan the QR at the door — bring this email on your phone.)\n\n` +
    `View your registration anytime: ${input.successPageUrl}\n` +
    `Event page: ${input.eventPageUrl}\n\n` +
    `Questions? Reply to this email or contact the BHN team at ${input.contactEmail}.\n\n` +
    `— BioHubNet`;

  // ── HTML body (table-based for email-client compat) ────────────
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

        <!-- Header band -->
        <tr><td style="background:linear-gradient(135deg, ${COLOR.brand900}, ${COLOR.brand} 75%);padding:32px 36px 28px 36px;text-align:left;">
          <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.78);font-weight:700;font-family:Menlo,Consolas,monospace;">
            ${esc(formatDateRange(input.eventStart, input.eventEnd, input.eventTimezone))}
          </p>
          <h1 style="margin:8px 0 0 0;font-size:28px;line-height:1.15;color:#ffffff;font-weight:700;letter-spacing:-0.01em;">
            ${esc(input.eventTitle)}
          </h1>
        </td></tr>

        <!-- Status banner -->
        <tr><td style="padding:0 36px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:-18px 0 0 0;">
            <tr><td style="background:${meta.accentTint};border:1px solid ${meta.accent}33;border-radius:14px;padding:14px 18px;">
              <p style="margin:0;font-size:10px;letter-spacing:0.22em;text-transform:uppercase;color:${meta.accent};font-weight:700;">
                ${esc(meta.eyebrow)}
              </p>
              <p style="margin:4px 0 0 0;font-size:15px;line-height:1.4;color:${COLOR.fg};font-weight:600;">
                ${meta.heading}
              </p>
            </td></tr>
          </table>
        </td></tr>

        <!-- Greeting + body -->
        <tr><td style="padding:24px 36px 12px 36px;">
          <p style="margin:0 0 12px 0;font-size:15px;color:${COLOR.fg};">${esc(greeting)}</p>
          <p style="margin:0;font-size:14.5px;line-height:1.55;color:${COLOR.fgMuted};">${meta.body}</p>
        </td></tr>

        <!-- Event details card -->
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

        <!-- Workshop picks (signed-in only — empty for guests) -->
        ${input.workshopLines.length > 0 ? `
        <tr><td style="padding:12px 36px;">
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:${COLOR.fgSubtle};font-weight:700;">Your workshop picks</p>
          <ul style="margin:0;padding:0 0 0 16px;font-size:14px;color:${COLOR.fg};line-height:1.7;">
            ${input.workshopLines.map((l) => `<li>${esc(l)}</li>`).join("")}
          </ul>
        </td></tr>` : ""}

        <!-- QR code panel -->
        <tr><td style="padding:18px 36px 6px 36px;text-align:center;">
          <p style="margin:0 0 12px 0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:${COLOR.fgSubtle};font-weight:700;">Your check-in pass</p>
          <img src="${qrDataUrl}" alt="QR check-in code: ${esc(input.qrToken)}" width="200" height="200" style="display:block;margin:0 auto;border-radius:12px;background:#ffffff;" />
          <p style="margin:10px 0 0 0;font-size:12px;line-height:1.5;color:${COLOR.fgSubtle};font-family:Menlo,Consolas,monospace;word-break:break-all;max-width:320px;margin-left:auto;margin-right:auto;">
            ${esc(input.qrToken)}
          </p>
        </td></tr>

        <!-- CTA -->
        <tr><td style="padding:22px 36px 28px 36px;text-align:center;">
          <a href="${esc(input.successPageUrl)}" style="display:inline-block;padding:12px 26px;background:${COLOR.brand};color:#ffffff;text-decoration:none;font-weight:700;font-size:14px;border-radius:12px;">
            View your registration
          </a>
          <p style="margin:14px 0 0 0;font-size:12.5px;color:${COLOR.fgSubtle};">
            Or open the event page directly: <a href="${esc(input.eventPageUrl)}" style="color:${COLOR.brand};text-decoration:none;">${esc(input.eventPageUrl.replace(/^https?:\/\//, ""))}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 36px 28px 36px;border-top:1px solid ${COLOR.line};text-align:center;background:${COLOR.bg};">
          <p style="margin:0;font-size:12px;color:${COLOR.fgMuted};line-height:1.6;">
            Questions? Reply to this email or contact the BHN team at
            <a href="mailto:${esc(input.contactEmail)}" style="color:${COLOR.brand};text-decoration:none;">${esc(input.contactEmail)}</a>.
          </p>
          <p style="margin:10px 0 0 0;font-size:11px;color:${COLOR.fgSubtle};letter-spacing:0.18em;text-transform:uppercase;font-weight:700;">BioHubNet</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return {
    subject: meta.subject,
    text,
    html,
  };
}
