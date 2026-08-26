/**
 * The "tell a colleague" email for an event's speaker link.
 *
 * It carries three things, because those are the three a colleague
 * actually needs and none of them is guessable:
 *
 *   1. what the thing is, in two sentences;
 *   2. the PUBLIC link they hand to an invited speaker;
 *   3. the ADMIN link where what the speaker sends lands.
 *
 * Pure — no Prisma, no mailer, no session. That is what lets it be
 * tested and previewed without sending anything.
 */

/** Long enough for a sentence of context, short enough not to be a memo. */
export const MAX_NOTE_CHARS = 600;

/** Enough for a team, small enough that this is not a mailing list. */
export const MAX_RECIPIENTS = 25;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isEmail(v: string): boolean {
  return EMAIL_RE.test(v.trim());
}

/**
 * Split a typed list of addresses on the separators people actually
 * use — commas, semicolons, newlines, or just spaces, because somebody
 * pasting three addresses out of Outlook gets whichever one Outlook
 * felt like.
 */
export function splitAddresses(text: string): string[] {
  return text.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
}

/**
 * The recipient rule, used by the panel to decide what to grey out and
 * by the route to decide what to refuse. Shared on purpose: a client
 * that allows what the server rejects is a form that fails on submit
 * for no visible reason.
 *
 * Deduplicated case-insensitively but kept as typed — the local part of
 * an address is technically case-sensitive, so we compare loosely and
 * send exactly.
 */
export function resolveRecipients(entries: Iterable<string>): { ok: string[]; bad: string[] } {
  const seen = new Set<string>();
  const ok: string[] = [];
  const bad: string[] = [];
  for (const raw of entries) {
    const addr = String(raw ?? "").trim();
    if (!addr) continue;
    const key = addr.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    (isEmail(addr) ? ok : bad).push(addr);
  }
  return { ok, bad };
}

function baseUrl(): string {
  const fromEnv =
    process.env.NEXTAUTH_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    "http://localhost:3001";
  return fromEnv.replace(/\/$/, "");
}

export function speakerFormUrl(slug: string): string {
  return `${baseUrl()}/events/${encodeURIComponent(slug)}/speaker`;
}

export function speakerAdminUrl(slug: string): string {
  // The [slug] route, not the workspace shortcut, because this one is
  // correct for every event rather than just the 2026 Symposium.
  return `${baseUrl()}/admin/events/${encodeURIComponent(slug)}/speakers`;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export interface SpeakerLinkMail {
  subject: string;
  text: string;
  html: string;
  /** Exposed so the UI can show exactly what will go out. */
  formUrl: string;
  adminUrl: string;
}

export function speakerLinkEmail(opts: {
  eventTitle: string;
  slug: string;
  intakeOpen: boolean;
  senderName: string;
  note?: string;
}): SpeakerLinkMail {
  const formUrl = speakerFormUrl(opts.slug);
  const adminUrl = speakerAdminUrl(opts.slug);
  const note = (opts.note ?? "").trim().slice(0, MAX_NOTE_CHARS);

  const subject = `Speaker details for ${opts.eventTitle} — one link to send out`;

  /*
   * Said plainly when the intake is CLOSED, rather than left out.
   * A colleague who forwards the link to eight speakers and finds it
   * turned off has spent their credibility, not ours.
   */
  const closed = opts.intakeOpen
    ? ""
    : "\n\nHeads up: the form is currently CLOSED, so it will not accept submissions until somebody opens it on the admin page below.";

  const text = [
    `${opts.senderName} thought you'd want this.`,
    "",
    `Invited speakers for ${opts.eventTitle} can now fill in their own details — headshot (with a drag-to-frame crop), title, organisation, a bio of up to 250 words, LinkedIn, and what their session will offer. No account, no login, one link.`,
    note ? `\n${note}\n` : "",
    "SEND THIS TO SPEAKERS",
    formUrl,
    "",
    "SEE WHAT THEY SEND (staff only)",
    adminUrl,
    "",
    "Everything a speaker submits lands on that admin page for you to check and edit before it goes anywhere near the website.",
    closed,
    "",
    "— sent from the BHN Training Platform",
  ]
    .filter((l) => l !== "")
    .join("\n");

  const FONT =
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const button = (href: string, label: string, sub: string, primary: boolean) => `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 14px 0;">
      <tr><td style="border-radius:10px;background:${primary ? "#3b6cef" : "#ffffff"};border:1px solid ${primary ? "#3b6cef" : "#cbd5e1"};">
        <a href="${esc(href)}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:${primary ? "#ffffff" : "#334155"};text-decoration:none;">${esc(label)}</a>
      </td></tr>
    </table>
    <p style="margin:0 0 18px 0;font-size:12px;color:#64748b;word-break:break-all;">${esc(sub)}<br><a href="${esc(href)}" style="color:#3b6cef;text-decoration:none;">${esc(href)}</a></p>`;

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:${FONT};color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2e8f0;">
        <tr><td style="background:linear-gradient(135deg,#0b1b3b,#3b6cef 75%);padding:28px 36px;color:#fff;">
          <p style="margin:0;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.78);font-weight:700;">Speaker details</p>
          <h1 style="margin:6px 0 0 0;font-size:22px;line-height:1.25;font-weight:700;">${esc(opts.eventTitle)}</h1>
        </td></tr>
        <tr><td style="padding:26px 36px 8px 36px;font-size:15px;line-height:1.6;">
          <p style="margin:0 0 14px 0;"><strong>${esc(opts.senderName)}</strong> thought you&rsquo;d want this.</p>
          <p style="margin:0 0 18px 0;">Invited speakers can now fill in their own details &mdash; headshot (with a drag-to-frame crop), title, organisation, a bio of up to 250&nbsp;words, LinkedIn, and what their session will offer. No account, no login, one link.</p>
          ${note ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;"><tr><td style="border-left:3px solid #3b6cef;background:#f1f5f9;padding:12px 16px;font-size:14px;line-height:1.6;color:#334155;">${esc(note).replace(/\n/g, "<br>")}</td></tr></table>` : ""}
        </td></tr>
        <tr><td style="padding:0 36px;">
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:700;">Send this to speakers</p>
          ${button(formUrl, "Open the speaker form", "The public page — safe to forward to anyone you have invited.", true)}
          <p style="margin:0 0 8px 0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#64748b;font-weight:700;">See what they send</p>
          ${button(adminUrl, "Open the admin page", "Staff only — sign in with your platform account.", false)}
          <p style="margin:0 0 18px 0;font-size:14px;line-height:1.6;color:#334155;">Everything a speaker submits lands on that admin page for you to check and edit before it goes anywhere near the website.</p>
          ${
            opts.intakeOpen
              ? ""
              : `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px 0;"><tr><td style="border-radius:10px;background:#fef3c7;border:1px solid #fcd34d;padding:12px 16px;font-size:13.5px;line-height:1.6;color:#78350f;"><strong>The form is currently closed</strong> and will not accept submissions until somebody opens it on the admin page above.</td></tr></table>`
          }
        </td></tr>
        <tr><td style="padding:18px 36px 26px 36px;border-top:1px solid #e2e8f0;background:#f8fafc;text-align:center;">
          <p style="margin:0;font-size:12px;color:#475569;line-height:1.6;">Sent from the BHN Training Platform. Reply to reach ${esc(opts.senderName)} directly.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html, formUrl, adminUrl };
}
