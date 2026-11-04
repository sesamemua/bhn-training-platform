/**
 * Canonical published Equip schedule + U of T holiday overlay.
 *
 * Two parts:
 *
 *   • VL_ROUNDS — the actual VentureLift round schedule
 *     (Round 3-7) as published in BHN's internal key-dates
 *     spreadsheet. Each round has 8 stages (Launch, Pre-screening
 *     deadline, Consultations, Invite decision, Full app
 *     deadline, Review deadline, Adjudication window, Funding
 *     announcement). These are stored as constants in code
 *     rather than DB rows because:
 *       (a) the dates are admin-managed offline (Google Sheet);
 *       (b) the deadlines page only needs to *display* them, not
 *           let admins edit them inline yet;
 *       (c) checking them into source keeps the schedule in
 *           version control next to the rest of the program copy.
 *     The /admin/equip/deadlines page auto-syncs EquipDeadline
 *     rows for the pre-screening + full-application deadlines
 *     so the submit-gate (which reads EquipDeadline) honours
 *     each round.
 *
 *   • UOFT_HOLIDAYS — the official University of Toronto holiday
 *     + closure schedule for FY 2025-26 and 2026-27, from
 *     https://people.utoronto.ca/memos/holiday-schedule-2025-26-and-2026-27/.
 *     Surfaced on the calendar so reviewers can see at a glance
 *     which days they shouldn't expect work to happen on
 *     (consultations, reviews, etc.). U of T is BHN's primary
 *     host institution; partner institutions usually follow the
 *     same days but ad-hoc closures aren't tracked here.
 */
import type { EquipStream } from "@/lib/equip/types";

// ── VentureLift rounds ────────────────────────────────────────

export type EquipRoundStageKey =
  | "launch"
  | "launch_reminder"
  | "pre_screening_deadline"
  | "consultations"
  | "invite_decision"
  | "full_app_deadline"
  | "review_deadline"
  | "adjudication"
  | "funding_announcement";

export interface EquipRoundStage {
  key: EquipRoundStageKey;
  label: string;
  /** ISO yyyy-mm-dd. For ranges, this is the start date. */
  date: string;
  /** End date for multi-day stages (consultations, adjudication
   *  window, funding announcement window). */
  endDate?: string;
  /** True when the published source says something like
   *  "Early August" instead of a specific date — surfaced in the
   *  UI so reviewers know not to treat it as gospel. */
  approximate?: boolean;
  /** Tone for the chip — drives visual emphasis. */
  tone: "amber" | "violet" | "brand" | "emerald" | "neutral";
}

export interface EquipRound {
  stream: EquipStream;
  roundNumber: number;
  label: string;
  /** Calendar year the round mostly lives in — used for
   *  grouping. */
  year: number;
  stages: EquipRoundStage[];
}

/** Source of truth: VentureLift_Key_Dates_2025-2026 spreadsheet (all rounds).
 *  Update this constant when a new round is announced. */
export const VL_ROUNDS: EquipRound[] = [
  {
    stream: "venture_lift",
    roundNumber: 3,
    label: "Round 3",
    year: 2025,
    stages: [
      { key: "launch",                 label: "Launch",                       date: "2025-08-25", tone: "brand"   },
      { key: "pre_screening_deadline", label: "Pre-screening deadline",       date: "2025-09-19", tone: "amber"   },
      { key: "consultations",          label: "Pre-screening consultations",  date: "2025-09-22", endDate: "2025-09-26", tone: "violet" },
      { key: "invite_decision",        label: "Invite decision",              date: "2025-10-01", tone: "brand"   },
      { key: "full_app_deadline",      label: "Full application deadline",    date: "2025-10-22", tone: "amber"   },
      { key: "review_deadline",        label: "Review deadline",              date: "2025-11-14", tone: "violet"  },
      { key: "adjudication",           label: "Adjudication window",          date: "2025-11-17", endDate: "2025-11-21", tone: "violet" },
      { key: "funding_announcement",   label: "Funding announcement",         date: "2025-12-05", approximate: true, tone: "emerald" },
    ],
  },
  {
    stream: "venture_lift",
    roundNumber: 4,
    label: "Round 4",
    year: 2026,
    stages: [
      { key: "launch",                 label: "Launch",                       date: "2025-12-15", tone: "brand"   },
      { key: "launch_reminder",        label: "Launch reminder",              date: "2026-01-06", tone: "neutral" },
      { key: "pre_screening_deadline", label: "Pre-screening deadline",       date: "2026-01-23", tone: "amber"   },
      { key: "consultations",          label: "Pre-screening consultations",  date: "2026-01-26", endDate: "2026-01-30", tone: "violet" },
      { key: "invite_decision",        label: "Invite decision",              date: "2026-02-04", tone: "brand"   },
      { key: "full_app_deadline",      label: "Full application deadline",    date: "2026-02-25", tone: "amber"   },
      { key: "review_deadline",        label: "Review deadline",              date: "2026-03-17", tone: "violet"  },
      { key: "adjudication",           label: "Adjudication window",          date: "2026-03-19", endDate: "2026-03-25", tone: "violet" },
      { key: "funding_announcement",   label: "Funding announcement",         date: "2026-03-31", approximate: true, tone: "emerald" },
    ],
  },
  {
    stream: "venture_lift",
    roundNumber: 5,
    label: "Round 5",
    year: 2026,
    stages: [
      { key: "launch",                 label: "Launch",                       date: "2026-04-27", tone: "brand"   },
      { key: "pre_screening_deadline", label: "Pre-screening deadline",       date: "2026-05-22", tone: "amber"   },
      { key: "consultations",          label: "Pre-screening consultations",  date: "2026-05-25", endDate: "2026-05-29", tone: "violet" },
      { key: "invite_decision",        label: "Invite decision",              date: "2026-06-01", tone: "brand"   },
      { key: "full_app_deadline",      label: "Full application deadline",    date: "2026-06-05", tone: "amber"   },
      { key: "review_deadline",        label: "Review deadline",              date: "2026-06-30", tone: "violet"  },
      { key: "adjudication",           label: "Adjudication window",          date: "2026-07-23", endDate: "2026-07-30", tone: "violet" },
      { key: "funding_announcement",   label: "Funding announcement",         date: "2026-08-05", approximate: true, tone: "emerald" },
    ],
  },
  {
    stream: "venture_lift",
    roundNumber: 6,
    label: "Round 6",
    year: 2026,
    stages: [
      { key: "launch",                 label: "Launch",                       date: "2026-07-07", tone: "brand"   },
      { key: "pre_screening_deadline", label: "Pre-screening deadline",       date: "2026-08-01", tone: "amber"   },
      { key: "consultations",          label: "Pre-screening consultations",  date: "2026-08-04", endDate: "2026-08-08", tone: "violet" },
      { key: "invite_decision",        label: "Invite decision",              date: "2026-08-13", tone: "brand"   },
      { key: "full_app_deadline",      label: "Full application deadline",    date: "2026-09-05", tone: "amber"   },
      { key: "review_deadline",        label: "Review deadline",              date: "2026-09-24", tone: "violet"  },
      { key: "adjudication",           label: "Adjudication window",          date: "2026-09-25", endDate: "2026-09-29", tone: "violet" },
      { key: "funding_announcement",   label: "Funding announcement",         date: "2026-09-29", endDate: "2026-09-30", tone: "emerald" },
    ],
  },
  {
    stream: "venture_lift",
    roundNumber: 7,
    label: "Round 7",
    year: 2026,
    stages: [
      { key: "launch",                 label: "Launch",                       date: "2026-09-14", tone: "brand"   },
      { key: "pre_screening_deadline", label: "Pre-screening deadline",       date: "2026-10-05", tone: "amber"   },
      { key: "consultations",          label: "Pre-screening consultations",  date: "2026-10-08", endDate: "2026-10-14", tone: "violet" },
      { key: "invite_decision",        label: "Invite decision",              date: "2026-10-19", tone: "brand"   },
      { key: "full_app_deadline",      label: "Full application deadline",    date: "2026-11-08", tone: "amber"   },
      { key: "review_deadline",        label: "Review deadline",              date: "2026-11-25", tone: "violet"  },
      { key: "adjudication",           label: "Adjudication window",          date: "2026-11-27", endDate: "2026-12-03", tone: "violet" },
      { key: "funding_announcement",   label: "Funding announcement",         date: "2026-12-03", endDate: "2026-12-10", tone: "emerald" },
    ],
  },
];

/** Return only stages with a hard deadline (pre-screening + full
 *  application). These are the rows that get synced into
 *  EquipDeadline for submit-gate use. */
export function deadlineStagesFromRound(r: EquipRound): EquipRoundStage[] {
  return r.stages.filter(
    (s) => s.key === "pre_screening_deadline" || s.key === "full_app_deadline",
  );
}

// ── VentureConnect monthly deadlines ────────────────────────────
//
// VC is the small-ticket grant (≤$5K), run as monthly rounds. The
// dates come from BHN's published "VC & VL Key Dates" spreadsheet
// (rounds 16–21, Jul–Dec 2026) — NOT a computed cadence: the real
// deadlines don't always fall on the last Monday of the month (e.g.
// Aug 2026 closes Thu Aug 27, not Mon Aug 31), so they're listed
// explicitly. May/June 2026 predate that sheet and keep their
// original dates. Update VC_DEADLINES when a new round is published;
// the deadlines page re-syncs EquipDeadline on every load (a changed
// date replaces the old row: the stale one no longer matches a spec
// and is purged, the new one is inserted).

/** Published VentureConnect application (pre-screening) deadlines as
 *  ISO yyyy-mm-dd, one per monthly round. `round` is the published VC
 *  round number where known. Source: VC & VL Key Dates spreadsheet. */
const VC_DEADLINES: { date: string; round?: number }[] = [
  { date: "2026-05-25" },              // May 2026
  { date: "2026-06-29" },              // June 2026
  { date: "2026-07-27", round: 16 },   // July 2026
  { date: "2026-08-27", round: 17 },   // August 2026
  { date: "2026-09-24", round: 18 },   // September 2026
  { date: "2026-10-26", round: 19 },   // October 2026
  { date: "2026-11-27", round: 20 },   // November 2026
  { date: "2026-12-28", round: 21 },   // December 2026
];

/** Returns one DerivedDeadlineSpec per published VC monthly window.
 *  Idempotent — call it repeatedly and you'll get the same set. */
export function venturConnectMonthlyDeadlines(): DerivedDeadlineSpec[] {
  return VC_DEADLINES.map(({ date }) => {
    const [y, m] = date.split("-").map((s) => parseInt(s, 10));
    const monthName = new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-CA", {
      month: "long",
      timeZone: "UTC",
    });
    // Rounds launch on the first Tuesday of the month and close on the
    // published deadline.
    const opensAt = noonEasternOn(vcLaunchDate(date));
    return {
      stream: "venture_connect",
      deadlineAt: noonEasternOn(date),
      opensAt,
      cycleLabel: `${monthName} ${y}`,
      stageKey: "pre_screening_deadline",
      stageLabel: `${monthName} ${y} VC deadline`,
    };
  });
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const LAST_PUBLISHED_ROUND = { date: "2026-12-28", round: 21 };

/** Launch day of the VC round whose deadline is `deadline` (yyyy-mm-dd):
 *  the first Tuesday of that month. */
export function vcLaunchDate(deadline: string): string {
  const [y, m] = deadline.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  return ymd(new Date(Date.UTC(y, m - 1, 1 + ((2 - first.getUTCDay() + 7) % 7))));
}

/** Published VC round number for a deadline month, counting on monthly
 *  from the last round in the Key Dates sheet. Null before the numbered rounds. */
export function vcRoundNumber(deadline: string): number | null {
  const [y, m] = deadline.split("-").map(Number);
  const [ly, lm] = LAST_PUBLISHED_ROUND.date.split("-").map(Number);
  const n = LAST_PUBLISHED_ROUND.round + (y - ly) * 12 + (m - lm);
  return n >= 16 ? n : null;
}

/** Suggested VC deadline for a month, from the published pattern: the last
 *  Monday of the month, or the Monday before when that is the 30th/31st,
 *  then earlier still past weekends and statutory holidays. Presidential
 *  days and the December break don't count — published rounds use them. */
export function suggestVcDeadline(year: number, month: number): string {
  const last = new Date(Date.UTC(year, month, 0));
  let d = new Date(Date.UTC(year, month - 1, last.getUTCDate() - ((last.getUTCDay() + 6) % 7)));
  if (d.getUTCDate() >= 30) d = new Date(d.getTime() - 7 * 864e5);
  const statutory = (day: string) => { const h = isUofTHoliday(day); return !!h && !h.presidential && !h.endDate; };
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6 || statutory(ymd(d))) d = new Date(d.getTime() - 864e5);
  return ymd(d);
}

export interface VcRoundSuggestion {
  deadline: string;
  launch: string;
  launchText: string;
  cycleLabel: string;
  round: number | null;
  note: string;
}

/** The next `count` monthly VC rounds after the latest existing VC deadline. */
export function suggestVcRounds(existingDeadlines: string[], count = 6): VcRoundSuggestion[] {
  const latest = [...existingDeadlines].sort().at(-1) ?? ymd(new Date());
  let [y, m] = latest.split("-").map(Number);
  const out: VcRoundSuggestion[] = [];
  for (let i = 0; i < count; i++) {
    if (++m > 12) { m = 1; y++; }
    const deadline = suggestVcDeadline(y, m);
    out.push({ deadline, ...vcRoundMeta(deadline) });
  }
  return out;
}

/** Label, launch day and note a VC round carries, matching the published rounds. */
export function vcRoundMeta(deadline: string) {
  const [y, m] = deadline.split("-").map(Number);
  const launch = vcLaunchDate(deadline);
  const round = vcRoundNumber(deadline);
  const launchText = new Date(`${launch}T12:00:00Z`).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return {
    launch,
    cycleLabel: `${MONTHS[m - 1]} ${y}`,
    round,
    launchText,
    note: `${round ? `Round ${round} · ` : ""}${MONTHS[m - 1]} ${y} VC deadline`,
  };
}

/** Convert a stage's ISO yyyy-mm-dd date string into a UTC Date
 *  representing noon Eastern on that calendar day, accounting
 *  for DST. Mirrors the noonEastern helper that used to live in
 *  schedule.ts (since deleted with the bulk-seed feature) — kept
 *  here scoped to the auto-sync workflow. */
export function noonEasternOn(yyyymmdd: string): Date {
  const [y, m, d] = yyyymmdd.split("-").map((s) => parseInt(s, 10));
  // 17:00 UTC = noon EST (UTC-5). Adjust ±1h if Toronto is
  // currently on EDT.
  let candidate = new Date(Date.UTC(y, m - 1, d, 17, 0, 0));
  const torontoHour = parseInt(
    candidate.toLocaleString("en-US", { timeZone: "America/Toronto", hour: "numeric", hourCycle: "h23" }),
    10,
  );
  if (torontoHour === 13) candidate = new Date(candidate.getTime() - 60 * 60 * 1000);
  else if (torontoHour === 11) candidate = new Date(candidate.getTime() + 60 * 60 * 1000);
  return candidate;
}

/** Specs for the EquipDeadline rows that should exist for the
 *  given rounds. One row per round for each of (pre-screening,
 *  full application) — the two stages with hard submission
 *  cut-offs that the platform's submit-gate honours. */
export interface DerivedDeadlineSpec {
  stream: EquipStream;
  deadlineAt: Date;
  /** The earliest instant when this window should be considered
   *  open for submissions. For VL pre-screening this is the round
   *  launch date; for VL full application it is the invite-decision
   *  date; for VC monthly windows it is the first of the month.
   *  The sync function uses this to set the initial `status`
   *  correctly: "open" when opensAt ≤ now < deadlineAt, otherwise
   *  "scheduled" (future) or "closed" (past). */
  opensAt: Date;
  cycleLabel: string;
  /** Stage key — useful for surfaceful labelling and future
   *  filtering. Stored in the `note` column for now since
   *  EquipDeadline has no dedicated stage column. */
  stageKey: EquipRoundStageKey;
  stageLabel: string;
}

/** Compute the full set of derived EquipDeadline specs the platform
 *  cares about: every VentureLift round's pre-screening + full-app
 *  deadlines PLUS the monthly VentureConnect window (last Monday of
 *  every month through VC_DEADLINES_THROUGH_YEAR). The deadlines
 *  page calls this on render and inserts any missing rows. */
export function derivedDeadlineSpecs(): DerivedDeadlineSpec[] {
  const out: DerivedDeadlineSpec[] = [];
  for (const r of VL_ROUNDS) {
    // Window opens at the round's Launch date (pre-screening) or
    // the Invite Decision date (full application).
    const launchStage = r.stages.find((s) => s.key === "launch");
    const inviteStage = r.stages.find((s) => s.key === "invite_decision");
    for (const s of deadlineStagesFromRound(r)) {
      const openSource =
        s.key === "pre_screening_deadline" ? launchStage : inviteStage;
      const opensAt = noonEasternOn((openSource ?? s).date);
      out.push({
        stream: r.stream,
        deadlineAt: noonEasternOn(s.date),
        opensAt,
        cycleLabel: `${r.label} · ${s.label}`,
        stageKey: s.key,
        stageLabel: s.label,
      });
    }
  }
  // Append every monthly VC deadline through end of 2028. Order
  // doesn't matter — the sync layer dedupes by (stream, calendar
  // date) before inserting.
  for (const vc of venturConnectMonthlyDeadlines()) {
    out.push(vc);
  }
  return out;
}

// ── U of T holiday schedule ────────────────────────────────────

export interface UofTHoliday {
  name: string;
  /** ISO yyyy-mm-dd. */
  date: string;
  /** End date for multi-day closures (winter break). */
  endDate?: string;
  /** True for university-internal closures (Presidential Days)
   *  that aren't statutory holidays. Surfaces in the UI with a
   *  slightly different tone. */
  presidential?: boolean;
}

/** Source: https://people.utoronto.ca/memos/holiday-schedule-2025-26-and-2026-27/
 *  Combined for both fiscal years. */
export const UOFT_HOLIDAYS: UofTHoliday[] = [
  // FY 2025-26 — verified against the official memo
  // https://people.utoronto.ca/memos/holiday-schedule-2025-26-and-2026-27/
  { name: "Presidential Day",      date: "2025-06-30", presidential: true },
  { name: "Canada Day",            date: "2025-07-01" },
  { name: "Presidential Day",      date: "2025-08-01", presidential: true },
  { name: "Civic Holiday",         date: "2025-08-04" },
  { name: "Labour Day",            date: "2025-09-01" },
  { name: "Thanksgiving Day",      date: "2025-10-13" },
  { name: "December Holiday Break", date: "2025-12-24", endDate: "2026-01-02" },
  { name: "Family Day",            date: "2026-02-16" },
  { name: "Good Friday",           date: "2026-04-03" },
  { name: "Presidential Day",      date: "2026-05-15", presidential: true }, // Friday May 15 2026 — verified
  { name: "Victoria Day",          date: "2026-05-18" },
  // FY 2026-27 — verified against the official memo
  // Split into two entries (Mon 6/29 + Tue 6/30) to match the memo's
  // own treatment rather than collapsing into a single multi-day range.
  { name: "Presidential Day",      date: "2026-06-29", presidential: true },
  { name: "Presidential Day",      date: "2026-06-30", presidential: true },
  { name: "Canada Day",            date: "2026-07-01" },
  { name: "Civic Holiday",         date: "2026-08-03" },
  { name: "Labour Day",            date: "2026-09-07" },
  { name: "Thanksgiving Day",      date: "2026-10-12" },
  { name: "December Holiday Break", date: "2026-12-24", endDate: "2027-01-05" },
  { name: "Family Day",            date: "2027-02-15" },
  { name: "Good Friday",           date: "2027-03-26" },
  { name: "Victoria Day",          date: "2027-05-24" },
];

/** Return true if a given Toronto calendar date (yyyy-mm-dd)
 *  falls inside a holiday or closure window. */
export function isUofTHoliday(yyyymmdd: string): UofTHoliday | null {
  for (const h of UOFT_HOLIDAYS) {
    if (h.endDate) {
      if (yyyymmdd >= h.date && yyyymmdd <= h.endDate) return h;
    } else {
      if (yyyymmdd === h.date) return h;
    }
  }
  return null;
}

/** Flatten every holiday date into a Set of yyyy-mm-dd strings
 *  for cheap calendar-cell lookups. */
export function holidayDateSet(): Map<string, UofTHoliday> {
  const m = new Map<string, UofTHoliday>();
  for (const h of UOFT_HOLIDAYS) {
    if (h.endDate) {
      const start = new Date(h.date);
      const end = new Date(h.endDate);
      for (let d = new Date(start); d.getTime() <= end.getTime(); d.setDate(d.getDate() + 1)) {
        m.set(d.toISOString().slice(0, 10), h);
      }
    } else {
      m.set(h.date, h);
    }
  }
  return m;
}
