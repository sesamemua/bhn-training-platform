/**
 * What the caterer needs, per session and per day.
 *
 * Counts APPROVED seats only (who is actually coming), for sessions that
 * have not finished yet — a workshop that already happened needs nothing
 * more from the kitchen.
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

const NOT_A_NEED = /^(no dietary|other\b)/i;

/**
 * The caterer's list right now: approved seats in sessions that have not
 * ended. With `includePending`, requests still waiting for a decision are
 * counted too — for planning before anybody is approved, never as the list
 * the caterer is told is final.
 */
export function currentEntries(
  rows: (RegistrantRow & { workshopStart: string; workshopEnd: string })[],
  now: Date = new Date(),
  opts: { includePending?: boolean } = {},
): Entry[] {
  const counts = (status: string) => status === "confirmed" || (!!opts.includePending && status === "pending");
  return rows
    .filter((r) => counts(r.status) && !r.withdrawn && new Date(r.workshopEnd).getTime() > now.getTime())
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

/** One session's block, as it appears in the caterer's text. */
export const sessionText = (list: Entry[]) => sessionBlock(list).join("\n");

/** Toronto calendar day of a start time, for grouping sessions by day. */
export const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const dayLabel = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: tz, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));

/**
 * Everything the caterer needs, for every session still to come — or,
 * with `scope`, for the day or session the entries were narrowed to.
 */
export function fullText(entries: Entry[], asOf: string, opts: { scope?: string; pending?: boolean } = {}): string {
  const head = [
    `BioHubNet Training Week — dietary & accessibility${opts.scope ? ` — ${opts.scope}` : ""}`,
    `As of ${stamp(asOf)} · ${opts.pending ? "all requests, NOT YET APPROVED — numbers will change" : "approved attendees"} · upcoming sessions only`,
    "",
  ];
  if (!entries.length) return [...head, "No approved attendees for upcoming sessions yet."].join("\n");
  return [...head, ...sessions(entries).flatMap((l) => [...sessionBlock(l), ""])].join("\n").trimEnd();
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * The people in a session who need something, as a page to print: for
 * the caterer to check against, or for the lunch table. Warnings (an
 * allergy, an intolerance) first and in red — `warns` decides which.
 */
export function peopleListHtml(list: Entry[], opts: { title: string; asOf: string; pending?: boolean; warns: (e: Entry) => boolean }): string {
  const needy = list.filter((e) => e.dietary.length || e.dietaryOther || e.accessibility);
  const ordered = [...needy].sort((a, b) => Number(opts.warns(b)) - Number(opts.warns(a)) || a.name.localeCompare(b.name));
  const rows = ordered.map((e) => `<tr${opts.warns(e) ? ' class="warn"' : ""}><td>${esc(e.name)}</td><td>${esc(e.dietary.join(", ") || "—")}</td><td>${esc(e.dietaryOther || "—")}</td><td>${esc(e.accessibility || "—")}</td></tr>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(opts.title)}</title><style>
@page { size: letter portrait; margin: .6in }
body { font: 11pt/1.4 "Helvetica Neue", Helvetica, Arial, sans-serif; color: #111; -webkit-print-color-adjust: exact; print-color-adjust: exact }
h1 { font-size: 16pt; margin: 0 0 2pt } p { margin: 0 0 12pt; color: #555 } .draft { color: #b45309; font-weight: 700 }
table { width: 100%; border-collapse: collapse } th, td { text-align: left; padding: 5pt 6pt; border-bottom: 1px solid #ddd; vertical-align: top }
th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .06em; color: #666 } .warn td { color: #c8102e; font-weight: 700 }
</style></head><body>
<h1>${esc(opts.title)}</h1>
<p>${list.length} attending · ${needy.length} with a dietary or accessibility need · as of ${esc(stamp(opts.asOf))}${opts.pending ? ' · <span class="draft">includes requests not yet approved</span>' : ""}</p>
${needy.length ? `<table><thead><tr><th>Name</th><th>Dietary</th><th>Other</th><th>Accessibility</th></tr></thead><tbody>${rows}</tbody></table>` : "<p>Nobody in this session has a dietary or accessibility need.</p>"}
<script>window.addEventListener("load", function () { setTimeout(function () { window.print(); }, 300); });</script>
</body></html>`;
}
