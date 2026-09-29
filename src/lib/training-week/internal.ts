/**
 * Internal attendees: BioHubNet's own people at a Training Week session.
 *
 * Staff sit in on workshops, and so do a few named guests (Darius and
 * Gilbert among them). They are in the room and they eat lunch, but they
 * are not trainees: they must not take one of the seats a room offers
 * students, must not be ranked against students for one, and must not be
 * mistaken for a registrant nobody could find on a list.
 *
 * So "internal" is decided here, one rule for every screen:
 *   - a registration an admin made for them from the Internal list
 *     (marked __internal), or
 *   - any address at biohubnet.ca, or
 *   - an address on the Internal list — so a guest who fills in the
 *     public form is recognised without anybody doing anything.
 *
 * Decided when read, never stamped on the seat: add somebody to the list
 * and their existing seats move out of the student count at once;
 * remove them and they move back.
 *
 * Pure module: no Prisma, no React.
 */
import { z } from "zod";
import { emailKey } from "@/lib/eligibility/email-key";

/** Where the list lives (PlatformSetting). */
export const INTERNAL_KEY = "trainingWeek.internalPeople";

/** The organisation's own domain: staff addresses are internal without being listed. */
const OWN_DOMAIN = "@biohubnet.ca";

export const InternalPersonSchema = z.object({
  name: z.string().trim().min(1).max(120),
  /** Optional — a guest may have no address anybody knows. */
  email: z.string().trim().max(200).default(""),
  /** Said to the caterer when they are added to a session. */
  dietary: z.string().trim().max(300).default(""),
});
export type InternalPerson = z.infer<typeof InternalPersonSchema>;

/** Read back safely: anything unreadable is dropped, never fatal. */
export function parseInternal(raw: string | null | undefined): InternalPerson[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x) => {
      const r = InternalPersonSchema.safeParse(x);
      return r.success ? [r.data] : [];
    }).slice(0, 200);
  } catch {
    return [];
  }
}

/** The normalised addresses on the list, for matching. */
export function internalKeys(list: InternalPerson[]): Set<string> {
  const keys = new Set<string>();
  for (const p of list) {
    const k = p.email ? emailKey(p.email) : null;
    if (k) keys.add(k);
  }
  return keys;
}

/**
 * Is this person internal?
 *
 * `emails` is every address the registration carries — the form's own,
 * the trainee address they typed, an account's — because staff register
 * with whichever one they happen to use.
 */
export function isInternal(
  emails: (string | null | undefined)[],
  data: Record<string, unknown> | null | undefined,
  keys: Set<string>,
): boolean {
  if (data && data.__internal === true) return true;
  for (const raw of emails) {
    if (!raw) continue;
    if (raw.trim().toLowerCase().endsWith(OWN_DOMAIN)) return true;
    const k = emailKey(raw);
    if (k && keys.has(k)) return true;
  }
  return false;
}
