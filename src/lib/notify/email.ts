/**
 * The notification email: one message, to one person, about one thing.
 *
 * Written as an email somebody would actually send a colleague. That
 * means a greeting with their first name, one sentence saying who is
 * writing and why, the brief introduction from the feature register,
 * the links, and a sign-off. It does not mean a newsletter — no
 * masthead, no three columns of things they did not ask about.
 *
 * Pure: no Prisma, no mailer, no session. That is what lets it be
 * tested and previewed without sending anything.
 */
import type { NotifyFeature, NotifyLink } from "./features";
import { greetingName, MAX_NOTE_CHARS } from "./recipients";

export function baseUrl(): string {
  const fromEnv =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3001";
  return fromEnv.replace(/\/$/, "");
}

export function absolute(path: string): string {
  return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface NotifyMail {
  subject: string;
  text: string;
  html: string;
}

export interface NotifyMailInput {
  feature: NotifyFeature;
  context: string | null;
  /** What the reader is called. Empty is fine — the greeting adapts. */
  recipientName: string;
  senderName: string;
  /** Shown in the sign-off so a reply has somewhere obvious to go. */
  senderEmail?: string;
  note?: string;
  /** A live warning, resolved server-side by the feature. */
  caveat?: string;
  /** What this instance of the feature is about — usually an event
   *  title. Puts the specific thing in the subject line, so two events
   *  running at once do not produce two identical subjects. */
  contextName?: string | null;
}

/*
 * Single quotes inside the family names, not double.
 *
 * This string is interpolated into style="…". A double quote in
 * "Segoe UI" closes the attribute there, so the browser saw
 * font-family ending at BlinkMacSystemFont and threw the rest away —
 * every one of these emails rendered in the serif default. Caught by
 * looking at one, not by any test, because the HTML was still valid
 * enough to render.
 */
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

export function notifyEmail(input: NotifyMailInput): NotifyMail {
  const { feature, context, senderName } = input;
  const links = feature.links(context);
  const name = greetingName(input.recipientName);
  const greeting = name ? `Hi ${name},` : "Hi there,";
  const note = (input.note ?? "").trim().slice(0, MAX_NOTE_CHARS);
  const caveat = (input.caveat ?? "").trim();

  const what = input.contextName ? `${feature.name} — ${input.contextName}` : feature.name;
  const subject = `${what}: ${senderName} thought you'd want to know`;

  const url = (l: NotifyLink) => absolute(l.path);

  /*
   * Built as blocks joined by a blank line, not as lines with ""
   * spacers. The spacer version filtered out its own paragraph breaks
   * along with the conditional ones and arrived as a wall of text —
   * which is exactly the plain-text part somebody reads when their
   * client blocks HTML.
   */
  const blocks: (string | false)[] = [
    greeting,
    `${senderName} here — this is on the BHN Training Platform and I thought it would be useful to you.`,
    feature.intro,
    caveat !== "" && caveat,
    note !== "" && note,
    ...links.map((l) => `${l.label.toUpperCase()}\n${url(l)}\n${l.note}`),
    `— ${senderName}${input.senderEmail ? `\n${input.senderEmail}` : ""}`,
    "Sent from the BHN Training Platform.",
  ];
  const text = blocks.filter((b): b is string => typeof b === "string" && b !== "").join("\n\n");

  const button = (l: NotifyLink) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px 0;">
      <tr><td style="border-radius:10px;background:${l.primary ? "#3b6cef" : "#ffffff"};border:1px solid ${l.primary ? "#3b6cef" : "#cbd5e1"};">
        <a href="${esc(url(l))}" style="display:inline-block;padding:11px 20px;font-size:14px;font-weight:700;color:${l.primary ? "#ffffff" : "#334155"};text-decoration:none;">${esc(l.label)}</a>
      </td></tr>
    </table>
    <p style="margin:0 0 18px 0;font-size:12px;line-height:1.55;color:#64748b;word-break:break-word;">${esc(l.note)}<br><a href="${esc(url(l))}" style="color:#3b6cef;text-decoration:none;">${esc(url(l))}</a></p>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT};color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:28px 12px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;border:1px solid #e2e8f0;">
        <tr><td style="padding:30px 34px 6px 34px;font-size:15px;line-height:1.65;color:#0f172a;">
          <p style="margin:0 0 16px 0;">${esc(greeting)}</p>
          <p style="margin:0 0 16px 0;">${esc(senderName)} here &mdash; this is on the BHN Training Platform and I thought it would be useful to you.</p>
          <p style="margin:0 0 16px 0;">${esc(feature.intro)}</p>
          ${caveat ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td style="border-radius:10px;background:#fef3c7;border:1px solid #fcd34d;padding:11px 15px;font-size:13.5px;line-height:1.6;color:#78350f;">${esc(caveat)}</td></tr></table>` : ""}
          ${note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px 0;"><tr><td style="border-left:3px solid #3b6cef;background:#f1f5f9;padding:11px 15px;font-size:14px;line-height:1.6;color:#334155;">${esc(note).replace(/\n/g, "<br>")}</td></tr></table>` : ""}
        </td></tr>
        <tr><td style="padding:6px 34px 0 34px;">
          ${links.map(button).join("")}
        </td></tr>
        <tr><td style="padding:4px 34px 28px 34px;font-size:15px;line-height:1.65;color:#0f172a;">
          <p style="margin:0;">&mdash; ${esc(senderName)}</p>
          ${input.senderEmail ? `<p style="margin:2px 0 0 0;font-size:13px;"><a href="mailto:${esc(input.senderEmail)}" style="color:#3b6cef;text-decoration:none;">${esc(input.senderEmail)}</a></p>` : ""}
        </td></tr>
        <tr><td style="padding:14px 34px 20px 34px;border-top:1px solid #e2e8f0;background:#f8fafc;border-radius:0 0 14px 14px;">
          <p style="margin:0;font-size:11.5px;color:#64748b;line-height:1.6;">Sent from the BHN Training Platform. Reply to reach ${esc(senderName)} directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
