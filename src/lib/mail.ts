import nodemailer, { type Transporter } from "nodemailer";
import { prisma } from "@/lib/prisma";
import { cleanSignature, DEFAULT_SIGNATURE, SIGNATURE_KEY, withHtmlSignature, withSignature } from "@/lib/mail-signature";

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

/*
 * The signature every message ends with. Edited at /admin/email-signature
 * and kept as a PlatformSetting; read once a minute per server rather
 * than once per email, so a batch of letters costs one query, and a
 * saved change reaches every instance within that minute.
 */
const SIGNATURE_TTL_MS = 60_000;
let signatureCache: { text: string; at: number } | null = null;

export async function currentSignature(now = Date.now()): Promise<string> {
  if (signatureCache && now - signatureCache.at < SIGNATURE_TTL_MS) return signatureCache.text;
  const row = await prisma.platformSetting.findUnique({ where: { key: SIGNATURE_KEY } }).catch(() => null);
  const text = row?.value ? cleanSignature(row.value) : "";
  signatureCache = { text: text || DEFAULT_SIGNATURE, at: now };
  return signatureCache.text;
}

/** The editor calls this after saving, so its own next email uses the new one. */
export function forgetSignature() {
  signatureCache = null;
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
  /** Content-id: set it and the HTML can show the file inline with
   *  <img src="cid:…">, which is how the pass QR sits in the letter. */
  cid?: string;
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
  const signature = opts.signature === false ? null : await currentSignature();
  const cc = normaliseMailRecipients(opts.cc);
  const bcc = normaliseMailRecipients(opts.bcc);
  await t.sendMail({
    from: FROM,
    to: opts.to,
    cc: cc.length ? cc : undefined,
    bcc: bcc.length ? bcc : undefined,
    replyTo: opts.replyTo,
    subject: opts.subject,
    text: signature ? withSignature(opts.text, signature) : opts.text,
    html: signature && opts.html !== undefined ? withHtmlSignature(opts.html, signature) : opts.html,
    attachments: opts.attachments,
  });
}
