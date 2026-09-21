/**
 * What the caterer needs, and what changed since they were last told.
 *
 * Counts APPROVED seats only (who is actually coming), for sessions that
 * have not finished yet — a workshop that already happened needs nothing
 * more from the kitchen. Each copy is stored as the baseline, so the next
 * one can be "only what changed".
 *
 * Pure module: no React, no Prisma, no I/O.
 */
import { z } from "zod";
import type { RegistrantRow } from "./registrant-views";

/** One approved person in one upcoming session, as the caterer sees them. */
export const EntrySchema = z.object({
  workshopId: z.string(),
  workshop: z.string(),
  /** ISO start, for ordering and the day/time heading. */
  start: z.string(),
  personKey: z.string(),
  name: z.string(),
  /** Requirements only — "No dietary requirements" and the "Other…" tick are dropped. */
  dietary: z.array(z.string()),
  dietaryOther: z.string(),
  accessibility: z.string(),
});
export type Entry = z.infer<typeof EntrySchema>;

export const SnapshotSchema = z.object({
  at: z.string(),
  by: z.string().default(""),
  entries: z.array(EntrySchema).max(5000),
});
export type Snapshot = z.infer<typeof SnapshotSchema>;

export function parseSnapshot(raw: string | null | undefined): Snapshot | null {
  if (!raw) return null;
  try {
    const r = SnapshotSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

const NOT_A_NEED = /^(no dietary|other\b)/i;

/** The caterer's list right now: approved seats in sessions that have not ended. */
export function currentEntries(
  rows: (RegistrantRow & { workshopStart: string; workshopEnd: string })[],
  now: Date = new Date(),
): Entry[] {
  return rows
    .filter((r) => r.status === "confirmed" && new Date(r.workshopEnd).getTime() > now.getTime())
    .map((r) => ({
      workshopId: r.workshopId,
      workshop: r.workshop,
      start: r.workshopStart,
      personKey: r.personKey,
      name: r.name,
      dietary: r.dietary.filter((d) => !NOT_A_NEED.test(d)),
      dietaryOther: r.dietaryOther.trim(),
      accessibility: r.accessibility === "none" ? "" : r.accessibility.trim(),
    }))
    .sort((a, b) => a.start.localeCompare(b.start) || a.workshop.localeCompare(b.workshop) || a.name.localeCompare(b.name));
}

const key = (e: Entry) => `${e.workshopId}|${e.personKey}`;
const needs = (e: Entry) => [...e.dietary, ...(e.dietaryOther ? [`Other: ${e.dietaryOther}`] : [])];
const sameNeeds = (a: Entry, b: Entry) =>
  JSON.stringify(needs(a)) === JSON.stringify(needs(b)) && a.accessibility === b.accessibility;

export interface Change { kind: "added" | "removed" | "changed"; now?: Entry; was?: Entry }

/**
 * What changed since the last copy — for sessions still to come. People in
 * a session that has since happened are neither "removed" nor anything
 * else: the kitchen is done with that one.
 */
export function changesSince(prev: Snapshot | null, cur: Entry[], now: Date = new Date()): Change[] {
  if (!prev) return cur.map((e) => ({ kind: "added" as const, now: e }));
  const upcoming = (e: Entry) => cur.some((c) => c.workshopId === e.workshopId) || isAhead(e, now);
  const before = new Map(prev.entries.filter(upcoming).map((e) => [key(e), e]));
  const after = new Map(cur.map((e) => [key(e), e]));
  const out: Change[] = [];
  for (const [k, e] of after) {
    const was = before.get(k);
    if (!was) out.push({ kind: "added", now: e });
    else if (!sameNeeds(was, e)) out.push({ kind: "changed", now: e, was });
  }
  for (const [k, was] of before) if (!after.has(k)) out.push({ kind: "removed", was });
  return out;
}
// A session from the last copy counts as still ahead if it has not started
// yet by today's date — its end is not in the snapshot, the start is.
const isAhead = (e: Entry, now: Date) => new Date(e.start).getTime() > now.getTime();

// ── the text that gets pasted into the email ─────────────────────────

const tz = "America/Toronto";
const when = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const clock = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
const stamp = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso));

function sessions(entries: Entry[]) {
  const m = new Map<string, Entry[]>();
  for (const e of entries) m.set(e.workshopId, [...(m.get(e.workshopId) ?? []), e]);
  return [...m.values()];
}

function sessionBlock(list: Entry[]): string[] {
  const s = list[0];
  const lines = [`${when(s.start)}, ${clock(s.start)} — ${s.workshop}`, `  Attendees: ${list.length}`];
  const byNeed = new Map<string, string[]>();
  for (const e of list) for (const d of e.dietary) byNeed.set(d, [...(byNeed.get(d) ?? []), e.name]);
  for (const [d, names] of [...byNeed].sort()) lines.push(`  ${d}: ${names.length} (${names.join(", ")})`);
  for (const e of list.filter((x) => x.dietaryOther)) lines.push(`  Other — ${e.name}: ${e.dietaryOther}`);
  if (!byNeed.size && !list.some((x) => x.dietaryOther)) lines.push("  No dietary requirements");
  for (const e of list.filter((x) => x.accessibility)) lines.push(`  Accessibility — ${e.name}: ${e.accessibility}`);
  return lines;
}

/** Everything the caterer needs, for every session still to come. */
export function fullText(entries: Entry[], asOf: string): string {
  const head = [
    "BioHubNet Training Week — dietary & accessibility",
    `As of ${stamp(asOf)} · approved attendees · upcoming sessions only`,
    "",
  ];
  if (!entries.length) return [...head, "No approved attendees for upcoming sessions yet."].join("\n");
  return [...head, ...sessions(entries).flatMap((l) => [...sessionBlock(l), ""])].join("\n").trimEnd();
}

/** Only what changed since the last copy, with each affected session's new totals. */
export function updateText(changes: Change[], entries: Entry[], since: string, asOf: string): string {
  const head = [
    "BioHubNet Training Week — dietary & accessibility: UPDATE",
    `Changes since ${stamp(since)} (as of ${stamp(asOf)})`,
    "",
  ];
  if (!changes.length) return [...head, "No changes."].join("\n");
  const describe = (e: Entry) => [...needs(e), ...(e.accessibility ? [`accessibility: ${e.accessibility}`] : [])].join(", ") || "no requirements";
  const bySession = new Map<string, Change[]>();
  for (const c of changes) {
    const e = (c.now ?? c.was)!;
    bySession.set(e.workshopId, [...(bySession.get(e.workshopId) ?? []), c]);
  }
  const blocks = [...bySession.entries()]
    .sort(([, a], [, b]) => (a[0].now ?? a[0].was)!.start.localeCompare((b[0].now ?? b[0].was)!.start))
    .flatMap(([id, list]) => {
      const s = (list[0].now ?? list[0].was)!;
      const lines = [`${when(s.start)}, ${clock(s.start)} — ${s.workshop}`];
      for (const c of list) {
        if (c.kind === "added") lines.push(`  + Added: ${c.now!.name} — ${describe(c.now!)}`);
        if (c.kind === "removed") lines.push(`  − No longer attending: ${c.was!.name}`);
        if (c.kind === "changed") lines.push(`  ~ Changed: ${c.now!.name} — now ${describe(c.now!)} (was ${describe(c.was!)})`);
      }
      const nowList = entries.filter((e) => e.workshopId === id);
      lines.push(`  New total: ${nowList.length} attendee${nowList.length === 1 ? "" : "s"}`);
      return [...lines, ""];
    });
  return [...head, ...blocks].join("\n").trimEnd();
}
