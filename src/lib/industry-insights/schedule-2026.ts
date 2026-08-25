/**
 * BioHubNet Industry Insights, 24 September 2026.
 *
 * "Inside the Hiring Process: Meet the Decision Makers" — a virtual
 * afternoon of three hours, four company conversations in each, and a
 * registrant picks ONE company per hour.
 *
 * Read off biohubnet.ca/industry-insights on 22 August 2026. The page
 * says in three separate places that the schedule, sector order,
 * speakers and participating organisations are TENTATIVE — so the
 * unconfirmed slots are named as unconfirmed here rather than given
 * plausible-looking placeholders. A registrant choosing "Company 3"
 * should know they are choosing an hour, not a company.
 *
 * Pure module: no React, no I/O.
 */
import { torontoToUtc } from "@/lib/training-week/schedule-2026";

export const EVENT_DATE = "2026-09-24";
export const EVENT_TITLE = "BioHubNet Industry Insights";
export const EVENT_SUBTITLE = "Inside the Hiring Process: Meet the Decision Makers";

/** Every conversation is capped at this, and the page says so twice. */
export const PER_SESSION = 20;

export interface Conversation {
  /** Stable, and what an answer is stored against. */
  id: string;
  /** 1, 2 or 3 — which hour it runs in. */
  hour: 1 | 2 | 3;
  /** The company, or the honest placeholder. */
  company: string;
  /** Named speaker, where one is confirmed. */
  speaker: string | null;
  speakerTitle: string | null;
  /** False where the page still says "Guest organization TBA". */
  confirmed: boolean;
}

export const HOURS: { hour: 1 | 2 | 3; start: string; end: string; label: string }[] = [
  { hour: 1, start: "13:00", end: "14:00", label: "1:00–2:00 PM ET" },
  { hour: 2, start: "14:00", end: "15:00", label: "2:00–3:00 PM ET" },
  { hour: 3, start: "15:00", end: "16:00", label: "3:00–4:00 PM ET" },
];

const tba = (hour: 1 | 2 | 3, n: number): Conversation => ({
  id: `h${hour}-tba${n}`,
  hour,
  company: `Company ${n} — to be announced`,
  speaker: null,
  speakerTitle: null,
  confirmed: false,
});

export const CONVERSATIONS: Conversation[] = [
  { id: "h1-amacathera", hour: 1, company: "Amacathera", speaker: "Ab Khulbe", speakerTitle: "Chief of Staff & Materials Engineer", confirmed: true },
  tba(1, 2), tba(1, 3), tba(1, 4),

  { id: "h2-eurofins", hour: 2, company: "Eurofins CDMO Alphora Inc.", speaker: "Jeffrey Seres", speakerTitle: "Manager, Technology Transfer", confirmed: true },
  { id: "h2-spectral", hour: 2, company: "Spectral Medical", speaker: "Sagar Lahiri", speakerTitle: "Manager, Reagent Manufacturing", confirmed: true },
  tba(2, 3), tba(2, 4),

  { id: "h3-mdetect", hour: 3, company: "mDetect", speaker: "Irsa Wiginton", speakerTitle: "Co-Founder and Chief Development Officer", confirmed: true },
  tba(3, 2), tba(3, 3), tba(3, 4),
];

/**
 * The label a registrant picks. Names the speaker where there is one.
 *
 * Unique WITHIN an hour, not across the afternoon — the unannounced
 * slots deliberately read the same in every hour, because to a reader
 * choosing inside one hour "Company 3" is the clearest thing it can
 * say. See conversationFor.
 */
export function optionFor(c: Conversation): string {
  if (!c.confirmed) return c.company;
  return c.speaker ? `${c.company} — ${c.speaker}` : c.company;
}

/** Everything on offer in one hour, plus the way to opt out of it. */
export const NOT_THIS_HOUR = "I cannot make this hour";

export function optionsForHour(hour: 1 | 2 | 3): string[] {
  return [
    ...CONVERSATIONS.filter((c) => c.hour === hour).map(optionFor),
    NOT_THIS_HOUR,
  ];
}

/**
 * The conversation behind an answer — WITHIN ITS HOUR.
 *
 * The hour is not optional. Eight of the twelve are still unannounced
 * and read "Company 3 — to be announced", so the same label appears in
 * more than one hour: looked up on the label alone, an answer to the
 * 3 PM question resolves to a conversation at 1 PM.
 *
 * That is safe in the form, where each hour is its own question with
 * its own options — but a helper that LOOKS like it can resolve an
 * answer on its own is a trap for the first person who aggregates
 * across the afternoon.
 */
export const conversationFor = (hour: 1 | 2 | 3, option: string) =>
  CONVERSATIONS.find((c) => c.hour === hour && optionFor(c) === option);

/** Start and end of one hour, as instants. */
export function whenIs(hour: 1 | 2 | 3): { start: Date; end: Date } {
  const h = HOURS.find((x) => x.hour === hour)!;
  return { start: torontoToUtc(EVENT_DATE, h.start), end: torontoToUtc(EVENT_DATE, h.end) };
}

/** How many are still unnamed — worth saying out loud on the form. */
export const unconfirmedCount = () => CONVERSATIONS.filter((c) => !c.confirmed).length;
