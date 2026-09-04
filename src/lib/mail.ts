import nodemailer, { type Transporter } from "nodemailer";

const HOST = process.env.SMTP_HOST;
const PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
/**
 * Display name shown to recipients, when SMTP_FROM isn't set explicitly.
 * info@biohubnet.ca is BioHubNet's own address, not this platform's — a
 * "BHN Training" sender name on mail sent from it reads as the wrong
 * organization signing someone else's inbox. Every other configured
 * mailbox keeps the platform's own name.
 */
const SENDER_NAME = USER === "info@biohubnet.ca" ? "BioHubNet" : "BHN Training";
const FROM = process.env.SMTP_FROM ?? (USER ? `${SENDER_NAME} <${USER}>` : "");

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
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
}
