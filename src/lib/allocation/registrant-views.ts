/**
 * Views of the registrant list: a filter, a grouping, and whether each row
 * is a seat or a person. Nine are built in; coordinators save their own.
 *
 * Pure module: no React, no Prisma, no I/O.
 */
import { z } from "zod";
import type { Travel } from "./applicants";

/** One seat, with what the registration said about the person. */
export interface RegistrantRow {
  bookingId: string;
  /** Registration (or account) the seat belongs to — one person. */
  personKey: string;
  name: string;
  email: string;
  workshopId: string;
  workshop: string;
  /** YYYY-MM-DD in Toronto, and how it reads. */
  day: string;
  dayLabel: string;
  status: string;
  /** "owed" = decided but not emailed; "sent" = emailed; "none" = nothing to send. */
  letter: "owed" | "sent" | "none";
  travel: Travel;
  postcode: string;
  /** Selected dietary options, verbatim. Empty = not answered. */
  dietary: string[];
  dietaryOther: string;
  /** Free text; "" = not answered; the form's N/A answer is normalised to "none". */
  accessibility: string;
  preference: number | null;
  appliedAt: string;
  /** Programmes the registration matched when it was filed. Empty = on no list. */
  programmes: string[];
  /** The form it came in on: a session with its own page registers separately. */
  formSlug: string | null;
  /** The session's start and end (ISO) — catering skips sessions that are over. */
  workshopStart: string;
  workshopEnd: string;
}

export const GROUP_BY = ["none", "workshop", "day", "dietary", "accessibility", "status", "letter", "distance"] as const;
export type GroupBy = (typeof GROUP_BY)[number];
export const GROUP_LABEL: Record<GroupBy, string> = {
  none: "No grouping",
  workshop: "Workshop",
  day: "Day",
  dietary: "Dietary requirement",
  accessibility: "Accessibility",
  status: "Decision",
  letter: "Email status",
  distance: "Distance",
};

export const STATUSES = ["pending", "confirmed", "waitlist", "cancelled"] as const;
export const LETTERS = ["owed", "sent", "none"] as const;
export const TRAVELS = ["far", "near", "unknown"] as const;
export const LETTER_LABEL: Record<(typeof LETTERS)[number], string> = { owed: "Not sent", sent: "Sent", none: "Nothing to send" };
export const TRAVEL_LABEL: Record<Travel, string> = { far: "Out of town (over 2 h)", near: "Local", unknown: "Not answered" };

export const FiltersSchema = z.object({
  status: z.array(z.enum(STATUSES)).default([]),
  letter: z.array(z.enum(LETTERS)).default([]),
  travel: z.array(z.enum(TRAVELS)).default([]),
  workshopIds: z.array(z.string().max(60)).max(50).default([]),
  days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).max(14).default([]),
  /** "" any · "needs" has a dietary requirement · "none" none · "unanswered" · or one option verbatim. */
  dietary: z.string().max(80).default(""),
  /** "" any · "needs" · "none" · "unanswered". */
  accessibility: z.enum(["", "needs", "none", "unanswered"]).default(""),
  q: z.string().max(100).default(""),
});

export const ViewSchema = z.object({
  id: z.string().min(1).max(60),
  name: z.string().trim().min(1, "Give the view a name.").max(60),
  groupBy: z.enum(GROUP_BY).default("none"),
  /** One row per person (their workshops listed) instead of one per seat. */
  perPerson: z.boolean().default(false),
  filters: FiltersSchema.default(() => FiltersSchema.parse({})),
});
export type View = z.infer<typeof ViewSchema>;
export type Filters = View["filters"];

export const emptyFilters = (): Filters => FiltersSchema.parse({});
const v = (id: string, name: string, over: Partial<Omit<View, "filters">> & { filters?: Partial<Filters> } = {}): View =>
  ViewSchema.parse({ id, name, ...over, filters: { ...emptyFilters(), ...(over.filters ?? {}) } });

/** Built in: always there, never saved over or deleted. */
export const BUILT_IN_VIEWS: View[] = [
  // One row per person: somebody who asked for three sessions is one
  // registration, and three rows of the same name is three times the
  // scrolling for the same fact. The Rows toggle still says Seats.
  v("all", "All", { perPerson: true }),
  v("by-workshop", "By workshop", { groupBy: "workshop" }),
  v("by-day", "By day", { groupBy: "day" }),
  v("dietary", "Dietary & accessibility", { groupBy: "dietary", perPerson: true }),
  v("approved", "Approved", { filters: { status: ["confirmed"] }, groupBy: "workshop" }),
  v("declined", "Declined", { filters: { status: ["cancelled"] }, groupBy: "workshop" }),
  v("waitlisted", "Waitlisted", { filters: { status: ["waitlist"] }, groupBy: "workshop" }),
  v("letters", "Letters not sent", { filters: { letter: ["owed"] }, groupBy: "workshop" }),
  v("distance", "By distance", { groupBy: "distance", perPerson: true }),
];
export const isBuiltIn = (id: string) => BUILT_IN_VIEWS.some((b) => b.id === id);

/** Saved views, read back safely: anything unreadable is dropped, never fatal. */
export function parseViews(raw: string | null | undefined): View[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.flatMap((x) => {
      const r = ViewSchema.safeParse(x);
      return r.success && !isBuiltIn(r.data.id) ? [r.data] : [];
    }).slice(0, 50);
  } catch {
    return [];
  }
}

const NO_DIET = /^no dietary/i;
const hasDiet = (r: RegistrantRow) => r.dietary.some((d) => !NO_DIET.test(d)) || !!r.dietaryOther.trim();

export function matches(r: RegistrantRow, f: Filters): boolean {
  if (f.status.length && !f.status.includes(r.status as (typeof STATUSES)[number])) return false;
  if (f.letter.length && !f.letter.includes(r.letter)) return false;
  if (f.travel.length && !f.travel.includes(r.travel)) return false;
  if (f.workshopIds.length && !f.workshopIds.includes(r.workshopId)) return false;
  if (f.days.length && !f.days.includes(r.day)) return false;
  if (f.dietary) {
    if (f.dietary === "needs" && !hasDiet(r)) return false;
    if (f.dietary === "none" && !(r.dietary.length && !hasDiet(r))) return false;
    if (f.dietary === "unanswered" && r.dietary.length) return false;
    if (!["needs", "none", "unanswered"].includes(f.dietary) && !r.dietary.includes(f.dietary)) return false;
  }
  if (f.accessibility) {
    const a = r.accessibility;
    if (f.accessibility === "needs" && !(a && a !== "none")) return false;
    if (f.accessibility === "none" && a !== "none") return false;
    if (f.accessibility === "unanswered" && a) return false;
  }
  if (f.q.trim()) {
    const hay = [r.name, r.email, r.workshop, r.postcode, r.dietaryOther, r.accessibility, ...r.dietary].join(" ").toLowerCase();
    if (!hay.includes(f.q.trim().toLowerCase())) return false;
  }
  return true;
}

/** A row as shown: a seat, or a person with all their (matching) workshops. */
export interface ShownRow extends RegistrantRow {
  workshops: string[];
  seats: number;
}

export interface Group { key: string; label: string; rows: ShownRow[] }

const STATUS_LABEL: Record<string, string> = { pending: "Not decided", confirmed: "Approved", waitlist: "Waitlisted", cancelled: "Declined" };

/** The group(s) a row belongs in. A person with two dietary needs is in both. */
function groupsOf(r: RegistrantRow, by: GroupBy): { key: string; label: string; order: string }[] {
  switch (by) {
    case "workshop": return [{ key: r.workshopId, label: r.workshop, order: `${r.day} ${r.workshop}` }];
    case "day": return [{ key: r.day, label: r.dayLabel, order: r.day }];
    case "status": return [{ key: r.status, label: STATUS_LABEL[r.status] ?? r.status, order: String(STATUSES.indexOf(r.status as never)) }];
    case "letter": return [{ key: r.letter, label: LETTER_LABEL[r.letter], order: String(LETTERS.indexOf(r.letter)) }];
    case "distance": return [{ key: r.travel, label: TRAVEL_LABEL[r.travel], order: String(TRAVELS.indexOf(r.travel)) }];
    case "accessibility": {
      const a = r.accessibility;
      return [a && a !== "none"
        ? { key: "needs", label: "Has accessibility requirements", order: "0" }
        : a === "none" ? { key: "none", label: "None", order: "1" } : { key: "unanswered", label: "Not answered", order: "2" }];
    }
    case "dietary": {
      const needs = r.dietary.filter((d) => !NO_DIET.test(d));
      if (needs.length) return needs.map((d) => ({ key: d, label: d, order: `0 ${d}` }));
      if (r.dietaryOther.trim()) return [{ key: "Other", label: "Other", order: "0 Other" }];
      return r.dietary.length
        ? [{ key: "none", label: "No dietary requirements", order: "1" }]
        : [{ key: "unanswered", label: "Not answered", order: "2" }];
    }
    default: return [{ key: "all", label: "Everyone", order: "0" }];
  }
}

/** Apply a view: filter, then (optionally) fold seats into people, then group. */
export function applyView(rows: RegistrantRow[], view: View): Group[] {
  const kept = rows.filter((r) => matches(r, view.filters));
  const shown: ShownRow[] = view.perPerson
    ? [...kept.reduce((m, r) => {
        const p = m.get(r.personKey);
        if (p) { p.workshops.push(r.workshop); p.seats++; } else m.set(r.personKey, { ...r, workshops: [r.workshop], seats: 1 });
        return m;
      }, new Map<string, ShownRow>()).values()]
    : kept.map((r) => ({ ...r, workshops: [r.workshop], seats: 1 }));

  const groups = new Map<string, Group & { order: string }>();
  for (const r of shown) {
    for (const g of groupsOf(r, view.groupBy)) {
      const cur = groups.get(g.key) ?? { key: g.key, label: g.label, order: g.order, rows: [] };
      cur.rows.push(r);
      groups.set(g.key, cur);
    }
  }
  return [...groups.values()]
    .sort((a, b) => a.order.localeCompare(b.order))
    /*
     * Newest registration first, not A to Z.
     *
     * The question a coordinator opens this page with is "who came in
     * since I last looked" — an alphabetical list answers a question
     * nobody asks and buries today's registrations in the middle of it.
     * Name breaks the tie so the order is stable.
     */
    .map(({ key, label, rows }) => ({
      key, label,
      rows: rows.sort((x, y) => y.appliedAt.localeCompare(x.appliedAt) || x.name.localeCompare(y.name)),
    }));
}


// ── travel follow-up ────────────────────────────────────────────────

export interface Traveller {
  personKey: string;
  name: string;
  email: string;
  postcode: string;
  sessions: { workshop: string; dayLabel: string; status: string; start: string }[];
  appliedAt: string;
}

/** Everyone who said their one-way trip is over 2 hours — one row per person. */
export function travellers(rows: RegistrantRow[]): Traveller[] {
  const m = new Map<string, Traveller>();
  for (const r of rows) {
    if (r.travel !== "far") continue;
    const t = m.get(r.personKey) ?? { personKey: r.personKey, name: r.name, email: r.email, postcode: r.postcode, sessions: [], appliedAt: r.appliedAt };
    t.sessions.push({ workshop: r.workshop, dayLabel: r.dayLabel, status: r.status, start: r.workshopStart });
    m.set(r.personKey, t);
  }
  for (const t of m.values()) t.sessions.sort((a, b) => a.start.localeCompare(b.start));
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export const TRAVEL_HEAD = ["Name", "Email", "Postcode", "Sessions", "Registered"];
const DECISION: Record<string, string> = { pending: "not decided", confirmed: "approved", waitlist: "waitlisted", cancelled: "declined" };
export const travellerCells = (t: Traveller) => [
  t.name, t.email, t.postcode,
  t.sessions.map((s) => `${s.dayLabel} ${s.workshop} (${DECISION[s.status] ?? s.status})`).join("; "),
  new Date(t.appliedAt).toLocaleDateString("en-CA"),
];
