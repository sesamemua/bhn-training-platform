/**
 * The filming day as a timeline: tasks are bars, people are dragged onto
 * them. An interview is preparation first, then filming — a trainee's
 * hour is half an hour with their programme lead going through the
 * questions, then half an hour on camera.
 *
 * What the timeline checks, so the plan can be trusted on the day:
 *   - two things are never FILMED at once — there is one camera
 *     (preparation overlaps anything);
 *   - nobody is on two tasks at the same time;
 *   - nothing runs outside the building's hours;
 *   - no task is left with nobody on it.
 * A task marked flexible (Molly, whose time is not certain yet) is left
 * out of the first two: its time is a placeholder, not a promise.
 *
 * Pure module: no Prisma, no React.
 */
import { torontoToUtc } from "@/lib/training-week/schedule-2026";

export const TZ = "America/Toronto";

export const KINDS = ["setup", "logistics", "interview", "lab", "broll"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = {
  setup: "Set-up", logistics: "Logistics", interview: "Interview", lab: "Lab session", broll: "B-roll",
};
/** Kinds that need the camera for their filming part. */
const ON_CAMERA = new Set<string>(["interview", "lab"]);

export const GROUPS = ["team", "crew", "interviewee", "trainee"] as const;
export type Group = (typeof GROUPS)[number];
export const GROUP_LABEL: Record<Group, string> = { team: "Team", crew: "Crew", interviewee: "Interviewees", trainee: "Trainees" };

export interface Person {
  id: string;
  name: string;
  group: string;
  role: string;
  email: string;
}

export interface Block {
  id: string;
  kind: string;
  title: string;
  notes: string;
  /** ISO instants. */
  start: string;
  end: string;
  prepMinutes: number;
  locked: boolean;
  flexible: boolean;
  people: string[];
}

export interface Day {
  /** "YYYY-MM-DD". */
  date: string;
  opensAt: string;
  closesAt: string;
}

const ms = (iso: string) => new Date(iso).getTime();
const MIN = 60_000;

/** When the camera turns to this block. */
export const filmStart = (b: Pick<Block, "start" | "end" | "prepMinutes">) =>
  Math.min(ms(b.start) + b.prepMinutes * MIN, ms(b.end));

const overlap = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && b0 < a1;

export type Issue =
  | { kind: "camera"; a: Block; b: Block }
  | { kind: "person"; person: Person; a: Block; b: Block }
  | { kind: "hours"; block: Block; when: "before" | "after" }
  | { kind: "nobody"; block: Block };

export function issues(day: Day, blocks: Block[], people: Person[]): Issue[] {
  const out: Issue[] = [];
  const firm = blocks.filter((b) => !b.flexible);
  for (let i = 0; i < firm.length; i++)
    for (let j = i + 1; j < firm.length; j++) {
      const a = firm[i], b = firm[j];
      if (ON_CAMERA.has(a.kind) && ON_CAMERA.has(b.kind) && overlap(filmStart(a), ms(a.end), filmStart(b), ms(b.end))) {
        out.push({ kind: "camera", a, b });
      }
      if (overlap(ms(a.start), ms(a.end), ms(b.start), ms(b.end))) {
        for (const id of a.people.filter((p) => b.people.includes(p))) {
          const person = people.find((p) => p.id === id);
          if (person) out.push({ kind: "person", person, a, b });
        }
      }
    }
  const opens = torontoToUtc(day.date, day.opensAt).getTime();
  const closes = torontoToUtc(day.date, day.closesAt).getTime();
  for (const b of blocks) {
    if (ms(b.start) < opens) out.push({ kind: "hours", block: b, when: "before" });
    if (ms(b.end) > closes) out.push({ kind: "hours", block: b, when: "after" });
    if (b.people.length === 0) out.push({ kind: "nobody", block: b });
  }
  return out;
}

/** Minutes after local midnight, for laying bars on the timeline. */
export function minuteOfDay(iso: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}
export const hhmmToMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};
export const minutesToHhmm = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
/** A Toronto wall-clock minute on the day, as an ISO instant. */
export const atMinute = (date: string, min: number) => torontoToUtc(date, minutesToHhmm(min)).toISOString();

export const clock = (iso: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
export const clockOf = (min: number) => {
  const h = Math.floor(min / 60), m = min % 60, h12 = ((h + 11) % 12) + 1;
  return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "a.m." : "p.m."}`;
};
export const longDate = (date: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(`${date}T12:00:00Z`));
