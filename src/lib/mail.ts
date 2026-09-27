import nodemailer, { type Transporter } from "nodemailer";

const HOST = process.env.SMTP_HOST;
const PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
/**
 * Who every message says it is from: BioHubNet.
 *
 * Recipients know the organisation, not this platform — "BHN Training"
 * in an inbox is a sender nobody signed up to hear from, next to an
 * address that plainly belongs to BioHubNet. So the display name is
 * fixed here rather than trusted to SMTP_FROM, which is an env var that
 * has carried the old name; only the ADDRESS is taken from it.
 */
export const SENDER_NAME = "BioHubNet";

/** "BioHubNet <addr>", whatever shape SMTP_FROM arrived in. */
export function senderFrom(smtpFrom: string | undefined, user: string | undefined): string {
  const fromEnv = smtpFrom?.match(/<([^>]+)>/)?.[1] ?? smtpFrom?.trim();
  const address = fromEnv || user;
  return address ? `${SENDER_NAME} <${address}>` : "";
}

const FROM = senderFrom(process.env.SMTP_FROM, USER);

/** Links the signature carries — the same ones biohubnet.ca's footer does. */
export const SIGNATURE_LINKS = {
  email: "info@biohubnet.ca",
  newsletter: "https://biohubnet.ca/newsletter/",
  linkedin: "https://www.linkedin.com/company/biohubnet",
};

/*
 * The standard "-- " delimiter (dash, dash, SPACE): mail clients know
 * it, fold what follows, and leave it out of replies.
 */
export function withSignature(text: string): string {
  return (
    `${text.replace(/\s+$/, "")}\n\n-- \n${SENDER_NAME}\n${SIGNATURE_LINKS.email}\n` +
    `Newsletter: ${SIGNATURE_LINKS.newsletter}\nLinkedIn: ${SIGNATURE_LINKS.linkedin}\n`
  );
}

export function withHtmlSignature(html: string): string {
  const { email, newsletter, linkedin } = SIGNATURE_LINKS;
  const block =
    `<div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;font:13px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#4b5563">` +
    `<strong style="color:#111827">${SENDER_NAME}</strong><br>` +
    `<a href="mailto:${email}" style="color:#1f4b5b">${email}</a><br>` +
    `<a href="${newsletter}" style="color:#1f4b5b">Newsletter</a> &middot; ` +
    `<a href="${linkedin}" style="color:#1f4b5b">LinkedIn</a>` +
    `</div>`;
  // A whole document (the EQUIP letters are one) takes it inside <body>;
  // after </html> it would sit outside the page, where some clients drop it.
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${block}</body>`) : html + block;
}

let cached: Transporter | null = null;

/** Returns true when SMTP env is configured. The send-code route uses
 *  this to give a clear error before pretending to send. */
export function mailConfigured(): boolean {
  return Boolean(HOST && USER && PASS && FROM);
}

function transporter(): Transporter {
  if (cached) return cached;
  if (!mailConfigured()) {
    throw new Error(
      "SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM."
    );
  }
  cached = nodemailer.createTransport({
    host: HOST,
    port: PORT,
    secure: PORT === 465, // 465 → implicit TLS, 587 → STARTTLS
    auth: { user: USER!, pass: PASS! },
  });
  return cached;
}

export interface MailAttachment {
  filename: string;
  /** Plain string or Buffer. */
  content: string | Buffer;
  /** e.g. "text/calendar; charset=utf-8; method=REQUEST" for .ics. */
  contentType?: string;
}

export function normaliseMailRecipients(value?: string | string[]): string[] {
  return (Array.isArray(value) ? value : value ? [value] : [])
    .map((address) => address.trim())
    .filter(Boolean);
}

export async function sendMail(opts: {
  to: string;
  /** Visible copy recipients. A real cc, not a second send: the people
   *  on it must SEE who else got the message — a program lead should be
   *  able to tell their coordinator was copied. Accepts one address or a
   *  list; empty entries are dropped so callers can pass an optional
   *  address without branching. */
  cc?: string | string[];
  /** Hidden copy recipients. Kept separate from cc so applicants never
   *  see internal archive or programme inboxes in their receipt. */
  bcc?: string | string[];
  subject: string;
  text: string;
  html?: string;
  /** Optional file attachments — passed through to nodemailer. Used
   *  by the registration-confirmation flow to ship a .ics calendar
   *  invite alongside the HTML body. */
  attachments?: MailAttachment[];
  /** False for mail to ourselves (backups, "somebody pressed Tell us"):
   *  a newsletter link in the team's own archive is noise. */
  signature?: boolean;
  /** Where replies should land. From stays fixed to SMTP_FROM — Gmail
   *  rewrites an unverified From, so overriding it would silently send as
   *  the mailbox anyway. Reply-To is the supported way to route an answer
   *  back to the person who actually wrote the message. */
  replyTo?: string;
}) {
  const t = transporter();
  const cc = normaliseMailRecipients(opts.cc);
  const bcc = normaliseMailRecipients(opts.bcc);
  await t.sendMail({
    from: FROM,
    to: opts.to,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.signature === false ? opts.text : withSignature(opts.text),
    html: opts.html === undefined || opts.signature === false ? opts.html : withHtmlSignature(opts.html),
    attachments: opts.attachments,
  });
}
