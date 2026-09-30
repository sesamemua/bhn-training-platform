/**
 * What the caterer was last given, per session — so a new allergy after
 * the cards went out is flagged instead of discovered at lunch.
 *
 * Every tent-card print, list print and copy records, for each session it
 * covered, which tent cards that session needed at that moment. A card a
 * session needs now that was not in its record is new since then.
 * Sessions nobody has printed or copied for yet have nothing to compare.
 *
 * Pure module: no React, no Prisma.
 */
import { z } from "zod";
import type { Entry } from "./catering";
import { cardKey, tentCards, type TentCard } from "./tent-cards";

/** Where the record lives (PlatformSetting). */
export const CATERING_SENT_KEY = "trainingWeek.cateringSent";

const SentSchema = z.object({
  at: z.string(),
  by: z.string().max(120),
  how: z.enum(["print", "copy"]),
  cards: z.array(z.string().max(120)).max(200),
});
export type Sent = z.infer<typeof SentSchema>;
export type SentRecord = Record<string, Sent>;

export function parseSent(raw: string | null | undefined): SentRecord {
  if (!raw) return {};
  try {
    const r = z.record(z.string(), SentSchema).safeParse(JSON.parse(raw));
    return r.success ? r.data : {};
  } catch {
    return {};
  }
}

function bySession(entries: Entry[]): Map<string, Entry[]> {
  const m = new Map<string, Entry[]>();
  for (const e of entries) m.set(e.workshopId, [...(m.get(e.workshopId) ?? []), e]);
  return m;
}

/** The record after giving the caterer these entries: their sessions' cards replace what was there. */
export function recordSent(prev: SentRecord, entries: Entry[], by: string, how: Sent["how"], at: string): SentRecord {
  const next = { ...prev };
  for (const [id, list] of bySession(entries)) {
    next[id] = { at, by, how, cards: tentCards(list).cards.map(cardKey) };
  }
  return next;
}

export interface NewCards {
  workshopId: string;
  workshop: string;
  start: string;
  since: Sent;
  cards: TentCard[];
}

/** Cards each session needs now that it did not when the caterer was last given it. */
export function newSinceSent(sent: SentRecord, entries: Entry[]): NewCards[] {
  const out: NewCards[] = [];
  for (const [id, list] of bySession(entries)) {
    const since = sent[id];
    if (!since) continue;
    const had = new Set(since.cards);
    const cards = tentCards(list).cards.filter((c) => !had.has(cardKey(c)));
    if (cards.length) out.push({ workshopId: id, workshop: list[0].workshop, start: list[0].start, since, cards });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
