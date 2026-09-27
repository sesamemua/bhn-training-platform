/**
 * The signature at the foot of every email the platform sends.
 *
 * Written once, as plain text, and edited by an admin at
 * /admin/email-signature — both formats come from that one text: the
 * plain-text version is it verbatim, the HTML version is it escaped with
 * its links made clickable. One source, so the two can never say
 * different things.
 *
 * Pure module: no Prisma, no nodemailer — the editor imports it for its
 * live preview. Reading the saved version is mail.ts's job.
 */

/** Where the edited signature is kept (PlatformSetting). */
export const SIGNATURE_KEY = "mail.signature";

export const SIGNATURE_MAX_CHARS = 1_000;
export const SIGNATURE_MAX_LINES = 15;

/** What every email ends with until somebody changes it. */
export const DEFAULT_SIGNATURE = [
  "BioHubNet",
  "Biomanufacturing Hub Network",
  "Leslie Dan Faculty of Pharmacy, University of Toronto",
  "144 College Street, Toronto, Ontario M5S 3M2, Canada",
  "https://biohubnet.ca",
  "info@biohubnet.ca",
  "Newsletter: https://biohubnet.ca/newsletter/",
  "LinkedIn: https://www.linkedin.com/company/biohubnet",
].join("\n");

/** Trim each line and the whole; collapse runs of blank lines to one. */
export function cleanSignature(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Why a signature cannot be saved, or null when it can. */
export function signatureProblem(raw: string): string | null {
  const s = cleanSignature(raw);
  if (!s) return "A signature cannot be empty — use “Put back the original” instead.";
  if (s.length > SIGNATURE_MAX_CHARS) return `Keep it under ${SIGNATURE_MAX_CHARS} characters; this is ${s.length}.`;
  if (s.split("\n").length > SIGNATURE_MAX_LINES) return `Keep it to ${SIGNATURE_MAX_LINES} lines or fewer.`;
  return null;
}

/*
 * The standard "-- " delimiter (dash, dash, SPACE): mail clients know
 * it, fold what follows, and leave it out of replies.
 */
export function withSignature(text: string, signature: string): string {
  return `${text.replace(/\s+$/, "")}\n\n-- \n${signature}\n`;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** One line, escaped, with its web addresses and email addresses made into links. */
function linkLine(line: string): string {
  const LINK = "color:#1f4b5b";
  return escape(line)
    .replace(/https?:\/\/[^\s<]+[^\s<.,;:)]/g, (url) => `<a href="${url}" style="${LINK}">${url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</a>`)
    .replace(/(^|[\s(])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/g, (_, pre: string, mail: string) => `${pre}<a href="mailto:${mail}" style="${LINK}">${mail}</a>`);
}

/** The signature as an HTML block: first line bold, the rest as they were typed. */
export function signatureHtml(signature: string): string {
  const [first, ...rest] = signature.split("\n");
  const lines = [`<strong style="color:#111827">${linkLine(first ?? "")}</strong>`, ...rest.map(linkLine)];
  return (
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;` +
    `font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#4b5563">` +
    lines.join("<br>") +
    `</div>`
  );
}

export function withHtmlSignature(html: string, signature: string): string {
  const block = signatureHtml(signature);
  // A whole document (the EQUIP letters are one) takes it inside <body>;
  // after </html> it would sit outside the page, where some clients drop it.
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${block}</body>`) : html + block;
}
