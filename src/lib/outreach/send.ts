/**
 * Outreach — turning a drafted message into one the platform actually sends.
 *
 * Everything here is deliberately pure and side-effect free so the send route
 * can decide *what* would happen before anything leaves the building: the same
 * functions produce the preview the sender confirms and the message that goes
 * out, so the preview cannot drift from reality.
 *
 * CASL (Canada's anti-spam law) governs these messages. A commercial
 * electronic message must identify the sender, give a mailing address, and
 * carry an unsubscribe mechanism that stays valid for 60 days and is honoured
 * within 10 business days. `caslFooter` and `unsubscribeToken` are how we meet
 * that; the send route refuses to send without them.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

/** Matches the check the auth and test-email routes already use. */
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const OUTREACH_FROM_NAME = "BioHubNet";

/**
 * Sender identification required by CASL s.6(2)(a)-(b). Kept here rather than
 * in a template so no template can ship without it.
 */
export const OUTREACH_SENDER_BLOCK = {
  org: "BioHubNet (Biomanufacturing Hub Network)",
  address: "University of Toronto, 27 King's College Circle, Toronto, ON M5S 1A1, Canada",
  email: "info@biohubnet.ca",
} as const;

export type SendSkipReason = "no-address" | "bad-address" | "unsubscribed" | "already-sent";

export interface RecipientCheck {
  ok: boolean;
  reason?: SendSkipReason;
  detail?: string;
}

/**
 * Decide whether a contact may be emailed. Skips are not failures — an
 * unaddressable row is normal in a working directory (placeholder entries like
 * "find the comms person at CDL" have no address at all), so these are
 * recorded and stepped over rather than aborting the batch.
 */
export function checkRecipient(input: {
  email: string | null | undefined;
  unsubscribedAt: Date | null | undefined;
  alreadySent: boolean;
}): RecipientCheck {
  if (input.alreadySent) {
    return { ok: false, reason: "already-sent", detail: "Already sent in this campaign." };
  }
  if (input.unsubscribedAt) {
    return { ok: false, reason: "unsubscribed", detail: "Contact has unsubscribed." };
  }
  const email = (input.email ?? "").trim();
  if (!email) return { ok: false, reason: "no-address", detail: "No email address on this contact." };
  if (!EMAIL_RE.test(email)) {
    return { ok: false, reason: "bad-address", detail: `Not a valid address: ${email}` };
  }
  return { ok: true };
}

/**
 * Unsubscribe links are signed rather than stored so they cannot be guessed
 * and need no extra table. Keyed to the person, so one opt-out covers every
 * list and every future campaign.
 */
function secret(): Buffer {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET is not configured — cannot sign unsubscribe links.");
  return Buffer.from(value);
}

export function unsubscribeToken(personId: string): string {
  return createHmac("sha256", secret()).update(personId).digest("base64url");
}

export function verifyUnsubscribeToken(personId: string, token: string): boolean {
  const expected = unsubscribeToken(personId);
  const a = Buffer.from(expected);
  const b = Buffer.from(token);
  // Length check first: timingSafeEqual throws on a mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function unsubscribeUrl(appOrigin: string, personId: string): string {
  const base = appOrigin.replace(/\/$/, "");
  return `${base}/outreach/unsubscribe/${personId}/${unsubscribeToken(personId)}`;
}

/**
 * The block appended to every outreach email. Plain text, because these are
 * person-to-person emails rather than marketing HTML — a partner should get
 * something that reads like a colleague wrote it.
 */
export function caslFooter(unsubscribeLink: string): string {
  return [
    "",
    "—",
    `${OUTREACH_SENDER_BLOCK.org}`,
    `${OUTREACH_SENDER_BLOCK.address}`,
    `${OUTREACH_SENDER_BLOCK.email}`,
    "",
    `If you'd rather not hear from us, unsubscribe here and we'll stop: ${unsubscribeLink}`,
  ].join("\n");
}

/** The exact text that will be sent — preview and send both call this. */
export function composeBody(rendered: string, unsubscribeLink: string): string {
  return `${rendered.trimEnd()}\n${caslFooter(unsubscribeLink)}\n`;
}

/**
 * Google Workspace caps a mailbox at roughly 2,000 recipients a day and gets
 * unhappy about bursts. One send per this many milliseconds keeps a batch to a
 * human pace; the route also caps how many go in a single request so a batch
 * can't outrun the function timeout.
 */
export const SEND_THROTTLE_MS = 400;
export const SEND_BATCH_MAX = 40;
