/**
 * The 2026 Training Week, exactly as the coordinators planned it.
 *
 * This is the ONE place the week is written down. The registration
 * form's session list, the flow chart's drawing of it, the Workshop
 * rows behind the Admin dashboard, and the seed scripts all derive
 * from here.
 *
 * That matters because they used to disagree. The schedule was written
 * out four separate times — once in the seed script, once in the form,
 * once in the chart, once in the database — and the copies drifted:
 * the Catalent tour was recorded as running at the same hour as the
 * CCRM tour when the plan has them back to back, which quietly turned
 * a "you could do both" into a clash the form warned people about.
 *
 * Times are Toronto wall-clock, the way the planning grid writes them.
 * Everything that needs an instant converts through `torontoToUtc`.
 *
 * Pure module: no React, no I/O, no Prisma.
 */
import type { Slot } from "@/lib/formbuilder/calendar";

/* ── Toronto wall-clock → UTC ────────────────────────────────────────
 *
 * Not `hour + 4`. Late October is EDT so +4 happens to be right for
 * these three days, but a hard-coded offset is a trap for whoever
 * moves a session — the same grid in November is an hour out and
 * nothing complains. Ask the runtime what the offset actually is.
 */
const TZ = "America/Toronto";

/** Minutes the zone is ahead of UTC at a given instant (negative for Toronto). */
function offsetAt(instant: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ, hour12: false,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  // hour comes back as 24 for midnight under hour12:false in some ICU builds.
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return (asIfUtc - instant.getTime()) / 60_000;
}

/**
 * A Toronto wall-clock time as a real instant.
 *
 * Two passes: the first offset is read at the naive guess, which is
 * only wrong when the guess falls on the far side of a DST change, and
 * the second pass reads it again at the corrected instant. That is the
 * standard fix and it costs nothing here.
 */
export function torontoToUtc(day: string, hhmm: string): Date {
  const [y, m, d] = day.split("-").map(Number);
  const [h, min] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, min);
  let ms = naive - offsetAt(new Date(naive)) * 60_000;
  ms = naive - offsetAt(new Date(ms)) * 60_000;
  return new Date(ms);
}

/* ── the week ────────────────────────────────────────────────────── */

export interface Day {
  date: string;
  /** "Mon 26 Oct" — how the option labels and the chart name it. */
  label: string;
  /** The programme the day belongs to, from the planning grid. */
  theme: string;
  leads: string[];
}

export const DAYS: Day[] = [
  { date: "2026-10-26", label: "Mon 26 Oct", theme: "ENGAGE: Career pathways in industry", leads: ["Epshita", "Yeseul"] },
  { date: "2026-10-27", label: "Tue 27 Oct", theme: "EXPERIENCE: Professional development", leads: ["Yeseul", "Epshita"] },
  { date: "2026-10-28", label: "Wed 28 Oct", theme: "EQUIP: Innovation", leads: ["Roshni", "Yoo Jin"] },
];

/**
 * Thursday. Deliberately not in DAYS: the Symposium is a separate
 * event with its own registration, and the note that started this work
 * asked for the two to stop being run together.
 */
export const SYMPOSIUM_DAY = { date: "2026-10-29", label: "Thu 29 Oct", theme: "Symposium Day" };

export type VenueStatus =
  /** Room is held. */
  | "booked"
  /** Held, but the room itself is still being decided. */
  | "tbc"
  /** Asked for, no answer yet. */
  | "inquiry"
  /** More than one candidate room, none chosen. */
  | "options";

export interface Venue {
  name: string | null;
  /** A second candidate room, when the grid names one and neither is settled. */
  alternative?: string | null;
  status: VenueStatus;
  note: string | null;
}

export interface Session {
  /** Stable — it is the Workshop.slug, so it must not change with the title. */
  slug: string;
  title: string;
  /** Matches Workshop.kind: workshop | tour | bootcamp. */
  kind: "workshop" | "tour" | "bootcamp";
  day: string;
  /** Toronto wall-clock, 24-hour. */
  start: string;
  end: string;
  /** Which parallel track of the day, as the grid's "Option 1 / 2" columns. */
  track: 1 | 2;
  capacity: number;
  venue: Venue;
  partner: string | null;
  /** Who runs the room on the day. */
  facilitator: string | null;
  /** The BioHubNet coordinator who owns it. */
  lead: string | null;
  /** One line for the Workshop row and the admin table. */
  summary: string;
  /** Everything else the grid records against it. */
  notes: string[];
  /** The grid still has a question mark on this one. */
  tentative: boolean;
  /**
   * Titles this session has been shown under before.
   *
   * A rename has to stay traceable: the script that carries a schedule
   * change into the live form and chart identifies an existing option
   * by the title inside it, and without this a rename simply looks
   * like a stranger's edit and gets skipped.
   */
  previousTitles?: string[];
}

/**
 * The six bookable sessions.
 *
 * Read off the coordinators' planning grid. Two readings are worth
 * calling out because they changed behaviour:
 *
 *   • The Monday tours run BACK TO BACK (11:00–13:30, then
 *     14:00–16:30), not concurrently. Someone can do both.
 *   • CL3 runs the whole day, so it clashes with both tours — which
 *     is a clash the form never used to mention.
 */
export const SESSIONS: Session[] = [
  {
    slug: "ccrm-tour-lunch-learn-2026",
    title: "CCRM tour + Lunch & Learn",
    kind: "tour",
    day: "2026-10-26", start: "11:00", end: "13:30", track: 1,
    capacity: 20,
    venue: { name: "CCRM", status: "inquiry", note: "Inquiry made, site to be confirmed." },
    partner: "CCRM",
    facilitator: null,
    lead: "Epshita",
    summary: "Lunch & Learn, a tour of the facility, and time to talk to the people who work there.",
    notes: ["Lunch & Learn", "Company tour", "Talk to employees"],
    tentative: false,
  },
  {
    slug: "catalent-tour-lunch-learn-2026",
    title: "Catalent tour + Lunch & Learn",
    kind: "tour",
    day: "2026-10-26", start: "14:00", end: "16:30", track: 1,
    capacity: 20,
    venue: { name: "Catalent", status: "inquiry", note: "Inquiry made, site to be confirmed." },
    partner: "Catalent",
    facilitator: null,
    lead: "Epshita",
    summary: "Lunch & Learn, a tour of the facility, and time to talk to the people who work there.",
    notes: ["Lunch & Learn", "Company tour", "Talk to employees"],
    tentative: false,
  },
  {
    slug: "cl3-workshop-2026",
    title: "CL3 workshop",
    kind: "workshop",
    day: "2026-10-26", start: "09:30", end: "17:00", track: 2,
    capacity: 10,
    // The grid's Option 2 venue cell is BLANK. The old row named a
    // containment facility that appears nowhere in the plan, and a
    // guessed venue reads exactly like a decided one. The render sites
    // already fall back to "TBA".
    venue: { name: null, status: "tbc", note: "Venue not yet named on the plan." },
    partner: null,
    facilitator: null,
    lead: "Epshita",
    summary: "A full day in containment level 3, framed around pandemic preparedness.",
    notes: ["Runs the full day — it overlaps both company tours", "For the link to pandemic preparedness"],
    tentative: true,
  },
  {
    slug: "communication-chameleon-2026",
    title: "Communication Chameleon",
    kind: "workshop",
    day: "2026-10-27", start: "13:00", end: "16:00", track: 1,
    capacity: 30,
    venue: { name: "Room 850", status: "booked", note: "Calendar booking done, held 9 AM – 5 PM." },
    partner: "Rainmaker",
    facilitator: "Claudia Ferryman",
    lead: "Yeseul",
    summary: "Adapting how you communicate to the room you are in, run by Claudia Ferryman of Rainmaker.",
    notes: ["30 spots", "AV set-up needed", "Pre-assessment form — registration closes 3 weeks before"],
    tentative: false,
  },
  {
    slug: "negotiation-skills-2026",
    title: "Negotiation Skills",
    kind: "workshop",
    day: "2026-10-27", start: "13:00", end: "16:30", track: 2,
    capacity: 30,
    venue: { name: "Big pod + 210/310", status: "inquiry", note: "Rooms free 1–5 PM; booking still to be arranged." },
    partner: null,
    facilitator: "Glen Whyte",
    lead: "Epshita",
    summary: "Negotiation for researchers and founders, run by Glen Whyte.",
    notes: ["30 spots", "Priority: trainee entrepreneurs", "Scope and costs agreed — go/no-go decision pending"],
    tentative: false,
  },
  {
    slug: "innovation-showcase-2026",
    title: "BioHubNet innovation showcase",
    kind: "workshop",
    day: "2026-10-28", start: "10:00", end: "14:00", track: 1,
    capacity: 100,
    venue: {
      name: "MaRS Jewel Box", alternative: "POD220", status: "options",
      note: "POD220 is the room with a booking already made; the Jewel Box is the first choice. Not yet settled.",
    },
    partner: null,
    facilitator: null,
    lead: "Roshni",
    summary: "A pitch competition for selected participants, followed by the venture showcase.",
    notes: ["Pitch competition — selected participants", "Venture showcase — three-minute thesis"],
    tentative: false,
    previousTitles: ["Innovation showcase"],
  },
];

/**
 * On the grid but not bookable: everyone on the day is in it, so it is
 * drawn for context and never offered as a choice.
 */
export const SHARED = [
  {
    slug: "pizza-lunch-2026",
    title: "Pizza Lunch — top of the Pod",
    day: "2026-10-27", start: "12:00", end: "13:00",
    note: "Both tracks, before the afternoon sessions.",
  },
];

/**
 * Courses that run alongside the week rather than at an hour on it.
 * No seats and no clash — they are listed so the week reads complete.
 */
export const LEARNING_PATHS = [
  { title: "ENGAGE LP: CATTI Biomanufacturing course", days: ["2026-10-26", "2026-10-27", "2026-10-28"], note: null },
  { title: "ENGAGE LP: BioZone", days: ["2026-10-27", "2026-10-28"], note: "Biomanufacturing course + VR session (full module completion)." },
];

/* ── derived ─────────────────────────────────────────────────────── */

const dayOf = (date: string) => DAYS.find((d) => d.date === date);

/** "Mon 26 Oct · 11:00–13:30 · CCRM tour + Lunch & Learn" */
export function optionLabel(s: Session): string {
  return `${dayOf(s.day)?.label ?? s.day} · ${s.start}–${s.end} · ${s.title}`;
}

export const SESSION_OPTIONS: string[] = SESSIONS.map(optionLabel);

/** What the form's calendar view draws, and what it derives clashes from. */
export const SESSION_SLOTS: Slot[] = SESSIONS.map((s) => ({
  option: optionLabel(s), day: s.day, start: s.start, end: s.end,
}));

/**
 * The session an existing option string refers to, if any.
 *
 * Matches on the title inside the string rather than the string itself,
 * because the option format has changed and will change again — what
 * has to survive is knowing which session somebody meant.
 */
export const sessionInOption = (option: string): Session | undefined => {
  const hits = SESSIONS.filter((s) =>
    [s.title, ...(s.previousTitles ?? [])].some((t) => option.toLowerCase().includes(t.toLowerCase())));
  return hits.length === 1 ? hits[0] : undefined;
};

/** The Session behind an option string, or undefined if it is stale. */
export const sessionForOption = (option: string) =>
  SESSIONS.find((s) => optionLabel(s) === option);

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Pairs that genuinely overlap, as pairs rather than as day-groups.
 *
 * A group would be a lie here. CL3 overlaps both Monday tours but the
 * tours do not overlap each other, so lumping all three under "Monday"
 * would warn someone off a combination that is perfectly fine.
 */
export function clashPairs(): { label: string; options: [string, string] }[] {
  const out: { label: string; options: [string, string] }[] = [];
  for (let i = 0; i < SESSIONS.length; i++) {
    for (let j = i + 1; j < SESSIONS.length; j++) {
      const a = SESSIONS[i];
      const b = SESSIONS[j];
      if (a.day !== b.day) continue;
      if (!(toMin(a.start) < toMin(b.end) && toMin(b.start) < toMin(a.end))) continue;
      const from = Math.max(toMin(a.start), toMin(b.start));
      const to = Math.min(toMin(a.end), toMin(b.end));
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      // Just when the overlap is. The two sessions are listed beside
      // the label wherever it is drawn, and the chart's LimitSchema
      // caps a label at 60 characters — a sentence would be truncated
      // or rejected rather than shown.
      out.push({
        label: `${dayOf(a.day)?.label ?? a.day} · ${hhmm(from)}–${hhmm(to)}`,
        options: [optionLabel(a), optionLabel(b)],
      });
    }
  }
  return out;
}

/**
 * How many sessions one person may register for.
 *
 * A POLICY number and deliberately not a derived one. The week can
 * physically fit PHYSICALLY_POSSIBLE (see below), but three has been
 * the cap since the process was first drawn and nothing in the
 * coordinators' planning grid changes it — so moving a session's time
 * must not quietly hand everyone an extra seat.
 */
export const MAX_SESSIONS = 3;

/**
 * The most anyone could attend if the cap were lifted, clashes respected.
 *
 * Kept so a test can assert MAX_SESSIONS never exceeds it: a cap of
 * four on a week that can only fit three is a promise the form cannot
 * keep.
 */
export const PHYSICALLY_POSSIBLE = (() => {
  const byDay = new Map<string, Session[]>();
  for (const s of SESSIONS) byDay.set(s.day, [...(byDay.get(s.day) ?? []), s]);
  let total = 0;
  for (const list of byDay.values()) {
    // Greedy earliest-finishing-first: the classic interval-scheduling
    // answer, and exact for this problem.
    const sorted = [...list].sort((a, b) => toMin(a.end) - toMin(b.end));
    let last = -1;
    let n = 0;
    for (const s of sorted) if (toMin(s.start) >= last) { last = toMin(s.end); n += 1; }
    total += n;
  }
  return total;
})();

/**
 * Earliest start and latest end of the whole week, as instants.
 *
 * Compared as INSTANTS rather than as minutes-past-midnight. The first
 * version sorted every session by time-of-day and stapled the winner
 * onto DAYS[0] — which happened to be right only because the earliest
 * time in the week is also Monday's, and Monday's earliest is the one
 * session the grid still marks tentative. Take CL3 out and the week
 * would have claimed to start at a time lifted off Wednesday.
 */
const instants = SESSIONS.map((s) => [
  torontoToUtc(s.day, s.start).getTime(),
  torontoToUtc(s.day, s.end).getTime(),
] as const);
if (instants.length === 0) throw new Error("schedule-2026: SESSIONS is empty — the week has no bounds.");
export const WEEK_START = new Date(Math.min(...instants.map((i) => i[0])));
export const WEEK_END = new Date(Math.max(...instants.map((i) => i[1])));

/** The last moment of the event as a whole, Symposium Day included. */
export const EVENT_END = torontoToUtc(SYMPOSIUM_DAY.date, "17:00");

/* ── invariants, checked at import ───────────────────────────────────
 *
 * The chart caps an option string and a clash label at 60 characters
 * and DROPS what it cannot parse rather than complaining. A session
 * renamed past the limit would silently delete the whole "Choose your
 * sessions" box from the chart, which would still open, looking fine.
 * Fail here instead, where the name is being typed.
 */
export const MAX_OPTION_CHARS = 60;
for (const o of SESSION_OPTIONS) {
  if (o.length > MAX_OPTION_CHARS) {
    throw new Error(`schedule-2026: the option "${o}" is ${o.length} characters; the chart drops anything over ${MAX_OPTION_CHARS}.`);
  }
}

/**
 * The venue as it should be READ, not as it is filed.
 *
 * Only `locationName` reaches a page — the status and the note are
 * carried nowhere — so a room that is merely a candidate would be
 * published looking booked. Wednesday is the case that matters: the
 * grid's first choice is the MaRS Jewel Box, but POD220 is the room
 * actually held, and naming only the first would put the confirmed
 * room in no column of the database at all.
 */
export function displayVenue(v: Venue): string | null {
  if (!v.name) return null;
  const rooms = v.alternative ? `${v.name} or ${v.alternative}` : v.name;
  return v.status === "booked" ? rooms : `${rooms} (to be confirmed)`;
}

/** Everything a Workshop row needs, in display order. */
export const workshopRows = () =>
  SESSIONS.map((s, i) => ({
    slug: s.slug,
    title: s.title,
    kind: s.kind,
    startDateTime: torontoToUtc(s.day, s.start),
    endDateTime: torontoToUtc(s.day, s.end),
    capacity: s.capacity,
    locationName: displayVenue(s.venue),
    partnerOrganization: s.partner,
    shortDescription: s.summary,
    displayOrder: i,
  }));
