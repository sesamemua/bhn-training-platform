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
 * CCRM tour when that plan had them back to back, which quietly turned
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

/**
 * An hour inside a session that is not the session: a meal.
 *
 * Drawn as a band in the session's own block rather than as a separate
 * row, because that is what it is — somebody choosing the workshop is
 * choosing the lunch with it, and a lunch drawn beside the workshop
 * reads as a second thing to pick.
 */
export interface Break {
  /** "Lunch" — what the band says. */
  label: string;
  start: string;
  end: string;
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
  /** Which parallel track of the day, as the grid's "Option 1 / 2 / 3" columns. */
  track: 1 | 2 | 3;
  capacity: number;
  venue: Venue;
  partner: string | null;
  /** Who runs the room on the day. */
  facilitator: string | null;
  /** The BioHubNet coordinator who owns it. */
  lead: string | null;
  /** The second line on the calendar cell: what the short title stands for. */
  subtitle?: string;
  /** Meals inside the session's own hours. */
  breaks?: Break[];
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
  /**
   * Exact option strings this session has been offered under before.
   *
   * A time change moves the option string, and seats are made by exact
   * match. A form that is frozen with the old string — the v1 Training
   * Week registration, which people have already filled in — would
   * otherwise stop producing seats for this session the moment the
   * schedule moved, silently: makeSeats reports the miss and nobody
   * reads the report.
   */
  previousOptions?: string[];
}

/**
 * The six bookable sessions, from the coordinators' October grid.
 *
 * Three readings are worth calling out because they changed what a
 * registrant sees:
 *
 *   • Monday offers ONE company tour, 09:30–15:30, with the host still
 *     to be chosen. The Catalent tour is gone, and the CCRM tour has
 *     moved to Tuesday afternoon.
 *   • Monday's other option is the Pandemic Preparedness workshop and
 *     tour at the THCF, 09:30–14:00 — it used to be "CL3 workshop",
 *     with no facility named and ten places.
 *   • Tuesday now has three options, not two: the CCRM tour runs
 *     15:00–17:00, across the end of both afternoon workshops.
 */
export const SESSIONS: Session[] = [
  {
    /*
     * The slug is Catalent's because the Workshop row is. October's
     * grid keeps Monday's tour and replaces the host with "TBD", so
     * this is the same session with a host still to be chosen — and a
     * slug names a row, not a company. Renaming it would leave the row
     * and its bookings behind.
     */
    slug: "catalent-tour-lunch-learn-2026",
    title: "Company tour + Lunch & Learn",
    kind: "tour",
    day: "2026-10-26", start: "09:30", end: "15:30", track: 1,
    capacity: 20,
    venue: { name: null, status: "inquiry", note: "Host company still to be chosen; inquiry made." },
    partner: null,
    facilitator: null,
    lead: "Epshita",
    summary: "A Lunch & Learn, a tour of the company, and time to talk to the people who work there. The host is being confirmed.",
    notes: ["20 spots", "Lunch & Learn", "Company tour", "Talk to employees", "Host company to be confirmed"],
    tentative: true,
    previousTitles: ["Catalent tour + Lunch & Learn"],
    previousOptions: ["Mon 26 Oct · 14:00–16:30 · Catalent tour + Lunch & Learn"],
  },
  {
    slug: "cl3-workshop-2026",
    title: "Pandemic Preparedness — THCF",
    subtitle: "Toronto High Containment Facility (CL3)",
    kind: "workshop",
    day: "2026-10-26", start: "09:30", end: "14:00", track: 2,
    capacity: 20,
    breaks: [
      { label: "Breakfast", start: "09:30", end: "10:00" },
      { label: "Lunch", start: "11:30", end: "12:30" },
    ],
    // The grid's venue cell is still blank, but the session names the
    // facility — so it is read as the place without being read as a
    // room that has been booked.
    venue: { name: "Toronto High Containment Facility", status: "inquiry", note: "Named on the grid; no booking recorded." },
    partner: null,
    facilitator: null,
    lead: "Epshita",
    summary: "A containment-level-3 workshop on pandemic preparedness, with a tour of the facility.",
    notes: ["20 spots", "Workshop + tour", "Breakfast 09:30–10:00", "Lunch 11:30–12:30"],
    tentative: false,
    previousTitles: ["CL3 workshop"],
    previousOptions: ["Mon 26 Oct · 09:30–17:00 · CL3 workshop"],
  },
  {
    slug: "communication-chameleon-2026",
    title: "Communication Chameleon",
    kind: "workshop",
    /*
     * 12:00–16:30. Lunch is part of the workshop rather than an hour
     * before it, so the session owns it: somebody choosing this is
     * choosing to be there from noon. The afternoon has been 16:00 and
     * 16:30 at different points and answers were stored under each, so
     * every string it has been offered under stays resolvable below.
     */
    day: "2026-10-27", start: "12:00", end: "16:30", track: 1,
    capacity: 30,
    breaks: [{ label: "Lunch", start: "12:00", end: "13:00" }],
    venue: { name: "Room 850", status: "booked", note: "Calendar booking done, held 9 AM – 5 PM." },
    partner: "Rainmaker",
    facilitator: "Claudia Ferryman",
    lead: "Yeseul",
    summary: "Adapting how you communicate to the room you are in, run by Claudia Ferryman of Rainmaker.",
    notes: ["30 spots", "AV set-up needed", "Pre-assessment form — registration closes 3 weeks before"],
    tentative: false,
    previousOptions: [
      "Tue 27 Oct · 13:00–16:00 · Communication Chameleon",
      "Tue 27 Oct · 13:00–16:30 · Communication Chameleon",
    ],
  },
  {
    slug: "negotiation-skills-2026",
    title: "Negotiation Navigator",
    kind: "workshop",
    day: "2026-10-27", start: "12:00", end: "16:30", track: 2,
    capacity: 30,
    breaks: [{ label: "Lunch", start: "12:00", end: "13:00" }],
    venue: { name: "Big pod + 210/310", status: "inquiry", note: "Rooms free 1–5 PM; booking still to be arranged." },
    partner: null,
    facilitator: "Glen Whyte",
    lead: "Epshita",
    summary: "Negotiation for researchers and founders, run by Glen Whyte.",
    notes: ["30 spots", "Priority: trainee entrepreneurs"],
    tentative: false,
    previousTitles: ["Negotiation Skills"],
    previousOptions: [
      "Tue 27 Oct · 13:00–16:30 · Negotiation Skills",
      "Tue 27 Oct · 13:00–16:00 · Negotiation Navigator",
      "Tue 27 Oct · 13:00–16:30 · Negotiation Navigator",
    ],
  },
  {
    // Monday's CCRM tour on the September grid. October's grid moves it
    // to Tuesday afternoon, names it, and cuts it to 18 places.
    slug: "ccrm-tour-lunch-learn-2026",
    title: "Discovery to Delivery — CCRM",
    kind: "tour",
    day: "2026-10-27", start: "15:00", end: "17:00", track: 3,
    capacity: 18,
    venue: { name: "CCRM at MaRS", status: "inquiry", note: "Company tour at MaRS; site to be confirmed." },
    partner: "CCRM",
    facilitator: null,
    lead: "Epshita",
    summary: "A tour of CCRM at MaRS — how a discovery becomes a therapy that reaches patients.",
    notes: ["18 spots", "Company tour, MaRS"],
    tentative: false,
    previousTitles: ["CCRM tour + Lunch & Learn"],
    previousOptions: ["Mon 26 Oct · 11:00–13:30 · CCRM tour + Lunch & Learn"],
  },
  {
    slug: "innovation-showcase-2026",
    title: "Innovation Ignited",
    kind: "workshop",
    day: "2026-10-28", start: "10:00", end: "13:30", track: 1,
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
    previousTitles: ["BioHubNet innovation showcase", "Innovation showcase"],
    previousOptions: [
      "Wed 28 Oct · 10:00–14:00 · BioHubNet innovation showcase",
      "Wed 28 Oct · 10:00–14:00 · Innovation Ignited",
    ],
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

/**
 * What the form's calendar view draws, and what it derives clashes from.
 *
 * The capacity rides along because the grid writes it on the session
 * — "[20 spots]", "[18 spots]" — and a registrant ranking six sessions
 * is choosing partly on how likely a place is.
 */
export const SESSION_SLOTS: Slot[] = SESSIONS.map((s) => ({
  option: optionLabel(s), day: s.day, start: s.start, end: s.end, capacity: s.capacity,
  ...(s.subtitle ? { subtitle: s.subtitle } : {}),
  ...(s.breaks?.length ? { breaks: s.breaks.map((b) => ({ ...b })) } : {}),
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

/**
 * The Session behind an option string, or undefined if it is stale.
 *
 * Exact, still — the current label or one the session was offered
 * under before. Not the title substring match above: a seat is a
 * commitment, and "contains the word Chameleon" is a guess.
 */
export const sessionForOption = (option: string) =>
  SESSIONS.find((s) => optionLabel(s) === option || (s.previousOptions ?? []).includes(option));

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/**
 * Pairs that genuinely overlap, as pairs rather than as day-groups.
 *
 * A group would be a lie as soon as one day holds a pair that does
 * not overlap — the Monday tours ran back to back until October's
 * grid, and lumping them under "Monday" warned people off a
 * combination that was perfectly fine. Pairs cannot say that.
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

/*
 * There is NO CAP on how many sessions somebody may choose.
 *
 * There was one — three — and it has been removed deliberately: people
 * may pick one, or all of them. What replaces it is not a smaller
 * number but a WARNING, because the real constraint was never a count.
 * Two sessions running at the same hour is a problem however few you
 * picked, and six that do not overlap is not a problem at all.
 *
 * PHYSICALLY_POSSIBLE stays: it is what the week can actually hold once
 * clashes are respected, which is worth knowing even when nothing is
 * refused.
 */

/**
 * The most anyone could attend, clashes respected.
 *
 * Not a limit on what may be CHOSEN — nothing is refused — but the
 * honest answer to "how many of these could I actually be at", which
 * the clash warning is a per-pair version of.
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
 * time in the week is also Monday's. Take Monday out and the week
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
