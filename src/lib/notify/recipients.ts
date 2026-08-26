/**
 * Who a notification goes to, and what they are called.
 *
 * Shared by the panel and the route on purpose: a client that offers
 * what the server refuses is a form that fails on submit for no visible
 * reason.
 */

/** Enough for a team, small enough that this is not a mailing list. */
export const MAX_RECIPIENTS = 25;

/** Long enough for a sentence of context, short enough not to be a memo. */
export const MAX_NOTE_CHARS = 600;

/**
 * How many people one admin may notify in an hour, counted in the
 * database rather than in memory so it survives a serverless function
 * being recycled between requests.
 *
 * Set well above real use — telling forty colleagues about a launch is
 * a Tuesday — and low enough that a session someone else is holding
 * cannot be used as a relay while nobody is looking.
 */
export const PER_SENDER_PER_HOUR = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** A cheap length bound checked before any splitting or matching. */
export const MAX_ADDRESS_CHARS = 320; // RFC 5321 practical maximum

export function isEmail(v: string): boolean {
  const t = v.trim();
  return t.length <= MAX_ADDRESS_CHARS && EMAIL_RE.test(t);
}

/**
 * Split a typed list on the separators people actually use — commas,
 * semicolons, newlines, or plain spaces, because somebody pasting three
 * addresses out of Outlook gets whichever one Outlook felt like.
 */
export function splitAddresses(text: string): string[] {
  return text.split(/[,;\s]+/).map((t) => t.trim()).filter(Boolean);
}

export interface Recipient {
  email: string;
  /** Empty when nobody knows — the greeting falls back to "Hi there". */
  name: string;
}

/**
 * Deduplicate case-insensitively, keep the address as typed.
 *
 * Compared loosely because nobody means a different person by a
 * different case; sent exactly because the local part of an address is
 * technically case-sensitive and some servers act like it.
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

/**
 * The first name, for the greeting.
 *
 * "Hi Dr Amara Okonkwo," is a mail-merge; "Hi Amara," is a message. A
 * leading title is dropped for the same reason. When the name is not a
 * name — an address typed into the box by hand, a mailbox called
 * "info" — this returns "" and the greeting becomes "Hi there".
 */
export function greetingName(name: string | null | undefined): string {
  // Repeated, because "Prof. Dr. Amara" is one person with two titles
  // and a single strip leaves the greeting as "Hi Dr,".
  const cleaned = (name ?? "")
    .trim()
    .replace(/^((dr|prof|professor|mr|mrs|ms|mx|miss|sir|dame|rev|fr|hon|sr)\.?\s+)+/i, "");
  const first = cleaned.split(/\s+/)[0] ?? "";
  // A word, not an address fragment and not a job title in a slot where
  // a name was expected.
  return /^[\p{L}][\p{L}'’-]{0,39}$/u.test(first) ? first : "";
}
