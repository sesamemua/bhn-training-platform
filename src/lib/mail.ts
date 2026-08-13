import nodemailer, { type Transporter } from "nodemailer";

const HOST = process.env.SMTP_HOST;
const PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const USER = process.env.SMTP_USER;
const PASS = process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM ?? (USER ? `BHN Training <${USER}>` : "");

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

export async function sendMail(opts: {
  to: string;
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
  await t.sendMail({
    from: FROM,
    to: opts.to,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    attachments: opts.attachments,
  });
}
