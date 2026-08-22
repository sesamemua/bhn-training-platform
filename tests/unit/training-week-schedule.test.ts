import test from "node:test";
import assert from "node:assert/strict";
import {
  clashPairs, DAYS, displayVenue, MAX_OPTION_CHARS, optionLabel,
  PHYSICALLY_POSSIBLE, SESSION_OPTIONS, SESSION_SLOTS, SESSIONS, sessionForOption,
  SHARED, torontoToUtc, workshopRows, WEEK_END, WEEK_START,
} from "../../src/lib/training-week/schedule-2026";
import { clashes, packWeek } from "../../src/lib/formbuilder/calendar";
import { idOf, label as gridLabel, place, timeGrid, toMinutes } from "../../src/lib/allocation/schedule";
import { ChartSchema, NodeSchema } from "../../src/lib/flowchart/types";
import { TRAINING_WEEK_FLOW } from "../../src/lib/flowchart/seed";
import { TRAINING_WEEK_FORM } from "../../src/lib/formbuilder/training-week";
import { parseForm } from "../../src/lib/formbuilder/types";

const bySlug = (slug: string) => SESSIONS.find((s) => s.slug === slug)!;

/* ── the schedule itself ─────────────────────────────────────────── */

test("the Monday company tours run back to back, not at the same time", () => {
  // The bug this whole module exists to stop coming back: the tours
  // were recorded as concurrent, so the form warned people off doing
  // both when the plan is that they can.
  const ccrm = bySlug("ccrm-tour-lunch-learn-2026");
  const catalent = bySlug("catalent-tour-lunch-learn-2026");
  assert.equal(ccrm.end, "13:30");
  assert.equal(catalent.start, "14:00");
  assert.equal(clashes(
    { option: "a", day: ccrm.day, start: ccrm.start, end: ccrm.end },
    { option: "b", day: catalent.day, start: catalent.start, end: catalent.end },
  ), false);
});

test("CL3 runs across both tours, so both are clashes", () => {
  const pairs = clashPairs().map((c) => c.options.join(" + "));
  const cl3 = optionLabel(bySlug("cl3-workshop-2026"));
  const withCl3 = pairs.filter((p) => p.includes(cl3));
  assert.equal(withCl3.length, 2, "CL3 overlaps the CCRM tour and the Catalent tour");
});

test("the two Tuesday workshops clash with each other", () => {
  const a = optionLabel(bySlug("communication-chameleon-2026"));
  const b = optionLabel(bySlug("negotiation-skills-2026"));
  assert.ok(clashPairs().some((c) => c.options.includes(a) && c.options.includes(b)));
});

test("clashes are pairs, never day-wide groups", () => {
  // A "Monday" group would sweep in the two tours, which do not clash.
  for (const c of clashPairs()) assert.equal(c.options.length, 2);
});

test("the week has exactly these three clashes, named", () => {
  // Pinned as SLUG PAIRS, not recomputed. The next test compares
  // clashPairs() against calendar.clashes — which is the same predicate
  // over the same data, so it moves whenever the schedule moves and
  // cannot fail. This one is the tripwire: change a time and it breaks.
  const pairs = clashPairs()
    .map((c) => c.options.map((o) => sessionForOption(o)!.slug).sort().join(" + "))
    .sort();
  assert.deepEqual(pairs, [
    "catalent-tour-lunch-learn-2026 + cl3-workshop-2026",
    "ccrm-tour-lunch-learn-2026 + cl3-workshop-2026",
    "communication-chameleon-2026 + negotiation-skills-2026",
  ]);
});

test("the two Monday tours share a lane, which is how the calendar draws consecutive sessions", () => {
  const monday = packWeek(SESSION_SLOTS).find((d) => d.day === "2026-10-26")!;
  const lane = (slug: string) =>
    monday.slots.find((s) => sessionForOption(s.option)!.slug === slug)!.lane;
  assert.equal(
    lane("ccrm-tour-lunch-learn-2026"), lane("catalent-tour-lunch-learn-2026"),
    "consecutive sessions reuse a lane; only a genuine clash splits them",
  );
  assert.notEqual(lane("cl3-workshop-2026"), lane("ccrm-tour-lunch-learn-2026"));
});

test("every clash is a genuine overlap, and every overlap is listed", () => {
  const listed = new Set(clashPairs().map((c) => [...c.options].sort().join("|")));
  let real = 0;
  for (let i = 0; i < SESSION_SLOTS.length; i++) {
    for (let j = i + 1; j < SESSION_SLOTS.length; j++) {
      if (!clashes(SESSION_SLOTS[i], SESSION_SLOTS[j])) continue;
      real += 1;
      assert.ok(listed.has([SESSION_SLOTS[i].option, SESSION_SLOTS[j].option].sort().join("|")));
    }
  }
  assert.equal(listed.size, real);
});

test("nothing caps how many sessions may be chosen", () => {
  // The cap was removed on purpose: people may pick one or all of them.
  // What replaces it is the clash warning, because the real constraint
  // was never a count.
  const sessions = TRAINING_WEEK_FORM.fields.find((f) => f.key === "sessions")!;
  assert.equal(sessions.maxChoices, undefined, "a cap has come back");
  // Pinned, not just compared. Left as an inequality it passes against
  // a broken count — corrupt the greedy into counting everything and
  // it reads 6, which is still >= 3.
  assert.equal(
    PHYSICALLY_POSSIBLE, 4,
    "both Monday tours back to back, one of the Tuesday pair, the Wednesday showcase",
  );
  // And the week's real ceiling is still worth knowing, even though
  // nothing is refused.
  assert.ok(PHYSICALLY_POSSIBLE > 0);
});

test("no session ends before it starts, and none is a single instant", () => {
  for (const s of SESSIONS) assert.ok(s.start < s.end, `${s.title} ends at or before it starts`);
});

test("slugs are unique — they are the Workshop key", () => {
  assert.equal(new Set(SESSIONS.map((s) => s.slug)).size, SESSIONS.length);
});

test("every session sits on a day the week actually has", () => {
  const days = new Set(DAYS.map((d) => d.date));
  for (const s of SESSIONS) assert.ok(days.has(s.day), `${s.title} is on ${s.day}, which is not in the week`);
});

/* ── Toronto time ────────────────────────────────────────────────── */

test("Training Week is EDT, so 11:00 Toronto is 15:00 UTC", () => {
  assert.equal(torontoToUtc("2026-10-26", "11:00").toISOString(), "2026-10-26T15:00:00.000Z");
  assert.equal(torontoToUtc("2026-10-28", "10:00").toISOString(), "2026-10-28T14:00:00.000Z");
});

test("the offset is read, not assumed — November is EST, an hour further back", () => {
  // DST ends 1 Nov 2026. A hard-coded +4 would put this an hour out,
  // which is the trap this replaced.
  assert.equal(torontoToUtc("2026-11-10", "11:00").toISOString(), "2026-11-10T16:00:00.000Z");
});

test("the week's bounds span the first start to the last end", () => {
  assert.equal(WEEK_START.toISOString(), "2026-10-26T13:30:00.000Z"); // CL3, 09:30 EDT
  assert.equal(WEEK_END.toISOString(), "2026-10-28T18:00:00.000Z");   // showcase, 14:00 EDT
});

/* ── what the consumers get ──────────────────────────────────────── */

test("an option string names the day, the hours and the session", () => {
  assert.equal(
    optionLabel(bySlug("ccrm-tour-lunch-learn-2026")),
    "Mon 26 Oct · 11:00–13:30 · CCRM tour + Lunch & Learn",
  );
});

test("an option string round-trips back to its session", () => {
  for (const s of SESSIONS) assert.equal(sessionForOption(optionLabel(s))?.slug, s.slug);
});

test("every slot matches an offered option exactly", () => {
  // The calendar view finds a slot by string equality. One stray
  // character and a session silently stops being drawn.
  for (const slot of SESSION_SLOTS) assert.ok(SESSION_OPTIONS.includes(slot.option));
  assert.equal(SESSION_SLOTS.length, SESSION_OPTIONS.length);
});

test("option strings fit the chart's character limit", () => {
  // The module now throws at import if one is too long, so this pins
  // the limit itself rather than re-checking what already ran.
  assert.equal(MAX_OPTION_CHARS, 60);
  for (const o of SESSION_OPTIONS) assert.ok(o.length <= MAX_OPTION_CHARS, `${o.length} chars: ${o}`);
});

test("clash labels fit the chart's 60-character limit", () => {
  for (const c of clashPairs()) assert.ok(c.label.length <= MAX_OPTION_CHARS, `${c.label.length} chars: ${c.label}`);
});

test("the rule box the chart draws is a valid node", () => {
  // The real guard: build the limit exactly as the seed does and put it
  // through the schema. A cap or a clash list the schema refuses would
  // otherwise only show up as a chart that will not open.
  const node = NodeSchema.safeParse({
    id: "n2r", x: 366, y: 100, w: 220, h: 62, kind: "rule",
    text: "As many as you like · clashes flagged",
    limit: {
      field: "sessions",
      clashes: clashPairs().map((c) => ({ label: c.label, options: [...c.options] })),
    },
  });
  assert.ok(node.success, node.success ? "" : JSON.stringify(node.error.issues));
});

test("the sessions question survives the form parser", () => {
  // parseForm DROPS a field that breaks a limit rather than failing, so
  // an over-long option would take the whole question with it — which
  // is exactly how the consent question disappeared once.
  const parsed = parseForm(TRAINING_WEEK_FORM);
  const sessions = parsed.fields.find((f) => f.key === "sessions");
  assert.ok(sessions, "the sessions question was dropped by the parser");
  assert.deepEqual(sessions.options, SESSION_OPTIONS);
  assert.equal(sessions.slots.length, SESSIONS.length);
});

/* ── the Workshop rows ───────────────────────────────────────────── */

test("workshop rows carry the schedule's times as instants", () => {
  const rows = workshopRows();
  assert.equal(rows.length, SESSIONS.length);
  const ccrm = rows.find((r) => r.slug === "ccrm-tour-lunch-learn-2026")!;
  assert.equal(ccrm.startDateTime.toISOString(), "2026-10-26T15:00:00.000Z");
  assert.equal(ccrm.endDateTime.toISOString(), "2026-10-26T17:30:00.000Z");
  const catalent = rows.find((r) => r.slug === "catalent-tour-lunch-learn-2026")!;
  assert.equal(catalent.startDateTime.toISOString(), "2026-10-26T18:00:00.000Z");
});

test("workshop rows are in display order with no gaps", () => {
  assert.deepEqual(workshopRows().map((r) => r.displayOrder), SESSIONS.map((_, i) => i));
});

test("every workshop row has a capacity worth having", () => {
  for (const r of workshopRows()) assert.ok(r.capacity > 0, `${r.title} has no seats`);
});

test("each session keeps the kind it is presented as", () => {
  // Not "kind is one of three" — that only restates the TypeScript
  // union. Workshop.kind is an unconstrained String column and the kind
  // drives the badge on the public form, so the pairs are what matter.
  assert.deepEqual(
    Object.fromEntries(workshopRows().map((r) => [r.slug, r.kind])),
    {
      "ccrm-tour-lunch-learn-2026": "tour",
      "catalent-tour-lunch-learn-2026": "tour",
      "cl3-workshop-2026": "workshop",
      "communication-chameleon-2026": "workshop",
      "negotiation-skills-2026": "workshop",
      "innovation-showcase-2026": "workshop",
    },
  );
});

test("a venue that is not booked says so, and a room with no name stays empty", () => {
  const venue = (slug: string) => workshopRows().find((r) => r.slug === slug)!.locationName;
  // The room with a booking must appear somewhere a person can read.
  assert.match(venue("innovation-showcase-2026")!, /POD220/);
  assert.match(venue("innovation-showcase-2026")!, /to be confirmed/);
  // Booked rooms are stated plainly, with no hedge.
  assert.equal(venue("communication-chameleon-2026"), "Room 850");
  // The plan names no venue for CL3, so neither do we — the render
  // sites fall back to TBA rather than to an invented building.
  assert.equal(venue("cl3-workshop-2026"), null);
  for (const s of SESSIONS) {
    if (s.venue.status === "options") {
      assert.ok(s.venue.alternative, `${s.title} has two candidate rooms but names only one`);
      assert.ok(displayVenue(s.venue)!.includes(s.venue.alternative!));
    }
  }
});

test("the seeded chart survives its own schema with nothing dropped", () => {
  // parseChart DROPS what it cannot validate rather than throwing, so
  // an over-long option would delete the whole "Choose your sessions"
  // box and the chart would still open, looking finished. Compare the
  // counts, not just success.
  const parsed = ChartSchema.safeParse(TRAINING_WEEK_FLOW);
  assert.ok(parsed.success, parsed.success ? "" : JSON.stringify(parsed.error.issues.slice(0, 3)));
  assert.equal(parsed.data.nodes.length, TRAINING_WEEK_FLOW.nodes.length);
  assert.equal(parsed.data.edges.length, TRAINING_WEEK_FLOW.edges.length);
});

test("the admin calendar lays the real week out correctly", () => {
  // The geometry the Admin dashboard actually draws, from the real
  // schedule — checked here rather than by eye, because the calendar
  // sits behind a login and the numbers are the thing that can be wrong.
  const grid = timeGrid(
    workshopRows().map((r) => ({
      id: r.slug, title: r.title,
      startDateTime: r.startDateTime.toISOString(), endDateTime: r.endDateTime.toISOString(),
    })),
    SHARED,
  );

  assert.deepEqual(grid.days.map((d) => d.day), ["2026-10-26", "2026-10-27", "2026-10-28"]);
  assert.equal(gridLabel(grid.hours[0]), "09:00", "CL3 starts at 09:30, so the grid opens on the 09:00 line");
  assert.equal(gridLabel(grid.hours[grid.hours.length - 1]), "17:00");

  const at = (day: string, slug: string) =>
    grid.days.find((d) => d.day === day)!.slots.find((s) => idOf(s.option) === slug)!;

  // Monday: the two tours are consecutive, so they share a lane; CL3
  // runs across both and takes its own.
  const ccrm = at("2026-10-26", "ccrm-tour-lunch-learn-2026");
  const catalent = at("2026-10-26", "catalent-tour-lunch-learn-2026");
  const cl3 = at("2026-10-26", "cl3-workshop-2026");
  assert.equal(ccrm.lane, catalent.lane);
  assert.notEqual(cl3.lane, ccrm.lane);
  assert.equal(cl3.lanes, 2, "CL3 is drawn half width against the tours");

  // The same hour on two days is the same height — the property that
  // makes the three columns readable across.
  const tue = at("2026-10-27", "communication-chameleon-2026");   // 13:00
  assert.equal(place(tue, grid).top, place({ ...ccrm, start: "13:00" }, grid).top);

  // The shared lunch sits inside the grid rather than off the top of it.
  const lunch = SHARED[0];
  assert.ok(toMinutes(lunch.start) >= grid.startMin && toMinutes(lunch.end) <= grid.endMin);
});
