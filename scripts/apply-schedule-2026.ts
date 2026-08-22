/**
 * Push the 2026 Training Week schedule out to everything that shows it.
 *
 * The coordinators' planning grid is the authority; this script carries
 * a change to it into the four places the week is displayed:
 *
 *   1. the Workshop rows behind the Admin dashboard,
 *   2. the event's own date range,
 *   3. the live registration form's "Choose your sessions" question,
 *   4. any flow chart drawing the same question.
 *
 * DRY RUN BY DEFAULT. `.env` here points at the production database, so
 * this prints what it would change and writes nothing until you pass
 * --force. Everything it is about to touch is written to backups/ first.
 *
 * SURGICAL. It never replaces a form or a chart wholesale — those are
 * documents a coordinator edits by hand, and a script that overwrites
 * them has already destroyed somebody's afternoon once. It changes only
 * the sessions question, and only when it can account for every option
 * already there. Anything it cannot explain, it leaves alone and reports.
 *
 * Run: npx tsx scripts/apply-schedule-2026.ts [--force]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { fieldsOf } from "../src/lib/flowchart/form";
import type { FlowNode } from "../src/lib/flowchart/types";
import { TRAINING_WEEK_FORM } from "../src/lib/formbuilder/training-week";
import {
  clashPairs, EVENT_END, optionLabel, SESSION_OPTIONS, SESSION_SLOTS,
  SESSIONS, sessionInOption, workshopRows, WEEK_START,
} from "../src/lib/training-week/schedule-2026";

const prisma = new PrismaClient();
const FORCE = process.argv.includes("--force");
const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

const changes: string[] = [];
const skipped: string[] = [];
const note = (s: string) => changes.push(s);
const skip = (s: string) => skipped.push(s);

function backup(kind: string, name: string, value: unknown) {
  if (!FORCE) return;
  mkdirSync(`backups/${kind}`, { recursive: true });
  const file = `backups/${kind}/${stamp}-${name}.json`;
  writeFileSync(file, JSON.stringify(value, null, 2));
  console.log(`  backed up → ${file}`);
}

/**
 * Compare two JSON values without caring how the database filed them.
 *
 * `EventForm.fields` is JSONB, which normalises object keys by length
 * then bytewise — so a slot written as {option, day, start, end} reads
 * back as {day, end, start, option} and a plain JSON.stringify compare
 * is false forever. Without this the script rewrites the live form on
 * every run, bumping updatedAt and clobbering whatever a coordinator
 * had open, while reporting a change that is not one.
 */
const canon = (v: unknown): string =>
  JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val);

const local = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", weekday: "short", year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZoneName: "short",
  }).format(d);

/**
 * Match the options a document already has against the sessions.
 *
 * Returns a full mapping or null. Null means "I do not recognise this
 * list" — a coordinator has edited it, and guessing which of their
 * options is which session is how you silently delete their work.
 */
function mapOptions(current: string[]): { map: Map<string, string> } | { why: string } {
  const out = new Map<string, string>();
  const used = new Set<string>();
  for (const opt of current) {
    // Matched on the title inside the option, and on any title the
    // session has been shown under before — otherwise renaming a
    // session makes every existing option look like a stranger's edit.
    const hit = sessionInOption(opt);
    if (!hit) return { why: `it offers "${opt}", which matches no session in the schedule` };
    if (used.has(hit.slug)) return { why: `"${opt}" and an earlier option both resolve to ${hit.title}` };
    used.add(hit.slug);
    out.set(opt, optionLabel(hit));
  }
  // Everything present is understood, but the schedule has grown. That
  // is a different situation from a hand edit and deserves its own
  // sentence: an added session is exactly what this script exists to
  // carry, and reporting it as "edited by hand" hides the one case the
  // four-copies problem shows up in.
  const missing = SESSIONS.filter((x) => !used.has(x.slug));
  if (missing.length > 0) {
    return { why: `it does not offer ${missing.map((x) => `"${optionLabel(x)}"`).join(", ")} — add the question in the builder, then re-run` };
  }
  return { map: out };
}

/**
 * The question node for `sessions`, wherever it now lives.
 *
 * A box can carry one field or a group of them, and the coordinator's
 * chart has moved this one into a group — so looking only at `field`
 * finds nothing and reports it as a hand edit, which is both wrong and
 * the kind of wrong that stops the update silently.
 *
 * Uses the app's own `fieldsOf`, which already knows both shapes and is
 * covered by tests, rather than a second copy of the same rule living
 * in a script nobody runs the test suite against.
 */
function sessionsField(nodes: Record<string, unknown>[]): { options?: string[] } | null {
  for (const n of nodes) {
    const hit = fieldsOf(n as unknown as FlowNode).find((f) => f.key === "sessions");
    if (hit) return hit as { options?: string[] };
  }
  return null;
}

/* ── 1. the workshops ───────────────────────────────────────────── */

async function workshops(eventId: string) {
  const rows = workshopRows();
  const current = await prisma.workshop.findMany({
    where: { eventId, slug: { in: rows.map((r) => r.slug) } },
  });

  const pending: { id: string; data: Record<string, unknown> }[] = [];

  for (const r of rows) {
    const was = current.find((c) => c.slug === r.slug);
    if (!was) { skip(`workshop ${r.slug} is not in the database — run seed-training-week-2026.ts first`); continue; }

    const diffs: string[] = [];
    if (was.title !== r.title) diffs.push(`title "${was.title}" → "${r.title}"`);
    if (was.startDateTime.getTime() !== r.startDateTime.getTime() || was.endDateTime.getTime() !== r.endDateTime.getTime())
      diffs.push(`when ${local(was.startDateTime)}–${local(was.endDateTime)} → ${local(r.startDateTime)}–${local(r.endDateTime)}`);
    if (was.capacity !== r.capacity) diffs.push(`capacity ${was.capacity} → ${r.capacity}`);
    if (was.locationName !== r.locationName) diffs.push(`venue "${was.locationName ?? "—"}" → "${r.locationName ?? "—"}"`);
    if (was.partnerOrganization !== r.partnerOrganization) diffs.push(`partner "${was.partnerOrganization ?? "—"}" → "${r.partnerOrganization ?? "—"}"`);
    if (was.shortDescription !== r.shortDescription) diffs.push("summary");
    if (was.kind !== r.kind) diffs.push(`kind ${was.kind} → ${r.kind}`);
    if (was.displayOrder !== r.displayOrder) diffs.push(`order ${was.displayOrder} → ${r.displayOrder}`);
    if (diffs.length === 0) continue;

    note(`workshop ${r.title}: ${diffs.join("; ")}`);
    pending.push({
      id: was.id,
      data: {
        title: r.title, kind: r.kind,
        startDateTime: r.startDateTime, endDateTime: r.endDateTime,
        capacity: r.capacity, locationName: r.locationName,
        partnerOrganization: r.partnerOrganization, shortDescription: r.shortDescription,
        displayOrder: r.displayOrder,
      },
    });
  }

  if (pending.length === 0) return;
  // Backed up AFTER the diff, so a run that changes nothing writes no
  // file. Otherwise a second --force drops a fresh dump of the
  // already-applied state and the newest backup stops being the thing
  // you would roll back to.
  backup("workshops", "before-schedule-2026", current);
  if (!FORCE) return;

  // One transaction. Seven separate updates mean a dropped connection
  // can leave half the week at the new times and half at the old, which
  // is worse than either.
  await prisma.$transaction(
    pending.map((p) => prisma.workshop.update({ where: { id: p.id }, data: p.data })),
  );
}

/* ── 2. the event window ────────────────────────────────────────── */

async function eventWindow(eventId: string) {
  const ev = await prisma.bhnEvent.findUniqueOrThrow({ where: { id: eventId } });

  // Refuse to touch an event that is not the one this schedule is for.
  // Widening only is safe against a stray hour; it is not safe against
  // a row still holding last year's dates, where it would silently
  // produce a twelve-month event.
  const yearOf = (d: Date) => Number(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric" }).format(d));
  const want = yearOf(WEEK_START);
  if (yearOf(ev.startDate) !== want || yearOf(ev.endDate) !== want) {
    skip(`event window: the event runs ${local(ev.startDate)} – ${local(ev.endDate)}, which is not ${want} — move it deliberately, not from here`);
    return;
  }

  // Widen only, and the end bound is SYMPOSIUM DAY, not the last
  // workshop: the event runs a day longer than Training Week, so
  // measuring it against the week alone would cut Thursday off.
  const start = ev.startDate.getTime() > WEEK_START.getTime() ? WEEK_START : ev.startDate;
  const end = ev.endDate.getTime() < EVENT_END.getTime() ? EVENT_END : ev.endDate;
  const movedStart = start.getTime() !== ev.startDate.getTime();
  const movedEnd = end.getTime() !== ev.endDate.getTime();
  if (!movedStart && !movedEnd) return;

  if (movedStart) note(`event start ${local(ev.startDate)} → ${local(start)}`);
  if (movedEnd) note(`event end ${local(ev.endDate)} → ${local(end)}`);
  // The old pair of dates exists nowhere else — this was the one write
  // with no way back.
  backup("events", ev.slug, ev);
  if (FORCE) await prisma.bhnEvent.update({ where: { id: eventId }, data: { startDate: start, endDate: end } });
}

/* ── 3. the live form ───────────────────────────────────────────── */

async function form() {
  // The help sentence is NOT retyped here. It is whatever the form
  // module says it is, so the cap and the wording cannot be right in
  // the code and stale in the database.
  const template = TRAINING_WEEK_FORM.fields.find((f) => f.key === "sessions");
  if (!template) throw new Error("The built form has no sessions question — nothing to apply.");

  const rows = await prisma.eventForm.findMany({ where: { slug: "training-week-registration-2026" } });
  for (const f of rows) {
    const doc = f.fields as { fields?: Record<string, unknown>[] } | null;
    const field = doc?.fields?.find((x) => x.key === "sessions");
    if (!field) { skip(`form ${f.slug} has no "sessions" question`); continue; }

    const got = mapOptions((field.options as string[]) ?? []);
    if ("why" in got) { skip(`form ${f.slug}: ${got.why} — left untouched`); continue; }

    // Compared on exactly the keys that get written, and canonically,
    // because the database reorders object keys. Comparing fewer keys
    // than you assign means a changed cap reports "nothing to change"
    // and then never reaches anybody.
    const same =
      canon(field.options) === canon(template.options) &&
      canon(field.slots) === canon(template.slots) &&
      canon(field.help ?? null) === canon(template.help ?? null);
    if (same) continue;

    backup("forms", `before-schedule-2026-${f.slug}`, f);
    note(`form ${f.slug}: session options, times and hint refreshed (${got.map.size} options)`);
    if (FORCE) {
      field.options = template.options;
      field.slots = template.slots;
      field.help = template.help;
      await prisma.eventForm.update({ where: { id: f.id }, data: { fields: doc as object } });
    }
  }
}

/* ── 4. the charts ──────────────────────────────────────────────── */

async function charts() {
  const rows = await prisma.flowChart.findMany();
  for (const c of rows) {
    const doc = c.data as { nodes?: Record<string, unknown>[] } | null;
    const nodes = doc?.nodes ?? [];
    const field = sessionsField(nodes);
    // Reported rather than skipped in silence. The header promises this
    // script says what it left alone, and "already matches" and "never
    // found it" look identical from the outside otherwise.
    if (!field) {
      if (nodes.length > 0) skip(`chart ${c.slug} has no "sessions" question`);
      continue;
    }

    const got = mapOptions(field.options ?? []);
    if ("why" in got) { skip(`chart ${c.slug}: ${got.why} — left untouched`); continue; }

    const rule = nodes.find((n) => (n.limit as { field?: string } | undefined)?.field === "sessions");
    const nextClashes = clashPairs().map((x) => ({ label: x.label, options: [...x.options] }));
    const limit = (rule?.limit ?? {}) as { max?: number; clashes?: unknown };
    const same =
      canon(field.options) === canon(SESSION_OPTIONS) &&
      // No cap any more, so the rule box is right when it has none.
      (!rule || (canon(limit.clashes) === canon(nextClashes) && limit.max === undefined));
    if (same) continue;

    backup("flowcharts", `before-schedule-2026-${c.slug}`, c);
    const capMoved = rule && limit.max !== undefined;
    note(`chart ${c.slug}: session options refreshed${
      rule ? `, ${nextClashes.length} clashes rewritten` : " (no rule box found)"
    }${capMoved ? `, the cap of ${limit.max} removed` : ""}`);
    if (FORCE) {
      field.options = SESSION_OPTIONS;
      if (rule) {
        rule.limit = { field: "sessions", clashes: nextClashes };
        rule.text = "As many as you like · clashes flagged";
      }
      await prisma.flowChart.update({ where: { id: c.id }, data: { data: doc as object } });
    }
  }
}

/* ── run ────────────────────────────────────────────────────────── */

async function main() {
  console.log(FORCE ? "APPLYING the 2026 schedule.\n" : "DRY RUN — nothing will be written. Add --force to apply.\n");

  const events = await prisma.bhnEvent.findMany({
    select: { id: true, title: true, _count: { select: { workshops: true } } },
  });
  const event = [...events].sort((a, b) => b._count.workshops - a._count.workshops)[0];
  if (!event) throw new Error("No event to attach workshops to.");
  console.log(`Event: ${event.title}\n`);

  await workshops(event.id);
  await eventWindow(event.id);
  await form();
  await charts();

  console.log(changes.length ? "Changes:" : "Nothing to change — everything already matches the schedule.");
  for (const c of changes) console.log(`  • ${c}`);
  if (skipped.length) {
    console.log("\nLeft alone:");
    for (const s of skipped) console.log(`  • ${s}`);
  }
  if (!FORCE && changes.length) console.log("\nRe-run with --force to apply.");
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => { console.error(err); return prisma.$disconnect().then(() => process.exit(1)); });
