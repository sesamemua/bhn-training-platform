/** Registrant views: built-ins, filters, grouping, per-person folding, saved views. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_VIEWS, ViewSchema, applyView, emptyFilters, parseViews, travellerCells, travellers, workshopRegistrantView, type RegistrantRow, type View,
} from "../../src/lib/allocation/registrant-views";
import { toCsv } from "../../src/lib/formbuilder/csv";
import { sortRegistrantRows, type RegistrantColumn } from "../../src/lib/allocation/registrant-sort";
import type { CoordinatorInfo } from "../../src/lib/training-week/coordinator-info";

const row = (o: Partial<RegistrantRow>): RegistrantRow => ({
  bookingId: "b", personKey: "p", name: "N", email: "n@x.ca", workshopId: "w1", workshop: "GMP", day: "2026-10-26",
  dayLabel: "Mon 26 Oct", status: "pending", letter: "none", travel: "unknown", postcode: "", dietary: [],
  dietaryOther: "", accessibility: "", preference: 1, appliedAt: "2026-09-20T10:00:00Z", programmes: [], formSlug: null,
  workshopStart: "2026-10-26T13:00:00Z", workshopEnd: "2026-10-26T16:00:00Z", ...o,
});
const rows = [
  row({ bookingId: "1", personKey: "ana", name: "Ana", status: "confirmed", letter: "owed", travel: "far", dietary: ["Vegan", "Halal"], accessibility: "Wheelchair access" }),
  row({ bookingId: "2", personKey: "ana", name: "Ana", workshopId: "w2", workshop: "RA 101", day: "2026-10-27", dayLabel: "Tue 27 Oct", status: "waitlist", travel: "far", dietary: ["Vegan", "Halal"], accessibility: "Wheelchair access" }),
  row({ bookingId: "3", personKey: "ben", name: "Ben", status: "cancelled", letter: "sent", travel: "near", dietary: ["No dietary requirements"], accessibility: "none" }),
  row({ bookingId: "4", personKey: "cy", name: "Cy", status: "pending" }),
];
const view = (id: string) => BUILT_IN_VIEWS.find((v) => v.id === id)!;
const count = (g: ReturnType<typeof applyView>) => Object.fromEntries(g.map((x) => [x.label, x.rows.length]));

test("column sorting is natural, case-insensitive, reversible and does not mutate rows", () => {
  const shown = applyView([
    row({ bookingId: "1", name: "person 10" }), row({ bookingId: "2", name: "Person 2" }), row({ bookingId: "3", name: "Alice" }),
  ], view("by-workshop"))[0].rows;
  const original = [...shown];
  for (const direction of ["ascending", "descending"] as const) {
    const sorted = sortRegistrantRows(shown, { column: "Name", direction }, () => undefined);
    assert.deepEqual(sorted.map((r) => r.name), direction === "ascending" ? ["Alice", "Person 2", "person 10"] : ["person 10", "Person 2", "Alice"]);
    assert.deepEqual(shown, original);
    assert.notEqual(sorted, shown);
  }
});

test("Choice sorts numerically and unanswered values remain last in both directions", () => {
  const shown = applyView([row({ preference: 10 }), row({ preference: null }), row({ preference: 2 })], view("by-workshop"))[0].rows;
  assert.deepEqual(sortRegistrantRows(shown, { column: "Choice", direction: "ascending" }, () => undefined).map((r) => r.preference), [2, 10, null]);
  assert.deepEqual(sortRegistrantRows(shown, { column: "Choice", direction: "descending" }, () => undefined).map((r) => r.preference), [10, 2, null]);
});

test("Day sorts chronologically rather than by the weekday label", () => {
  const shown = applyView([row({ day: "2026-10-30", dayLabel: "Fri 30 Oct" }), row({ day: "2026-10-26", dayLabel: "Mon 26 Oct" })], view("by-workshop"))[0].rows;
  assert.deepEqual(sortRegistrantRows(shown, { column: "Day", direction: "ascending" }, () => undefined).map((r) => r.day), ["2026-10-26", "2026-10-30"]);
  assert.deepEqual(sortRegistrantRows(shown, { column: "Day", direction: "descending" }, () => undefined).map((r) => r.day), ["2026-10-30", "2026-10-26"]);
});

test("all coordinator headings sort their actual source fields, leaving missing information last", () => {
  const shown = applyView([row({ bookingId: "z" }), row({ bookingId: "missing" }), row({ bookingId: "a" })], view("by-workshop"))[0].rows;
  const infoOf = (r: (typeof shown)[number]): CoordinatorInfo | undefined => r.bookingId === "missing" ? undefined : {
    name: "Source name", institution: r.bookingId, position: r.bookingId, company: r.bookingId, participation: r.bookingId,
    emailSource: "Roshni", recordedAt: "2026-10-16", recordedBy: "Admin",
  };
  for (const column of ["Institution", "Current role", "Company / venture", "Participation"] as const) {
    for (const direction of ["ascending", "descending"] as const) {
      assert.deepEqual(sortRegistrantRows(shown, { column, direction }, infoOf).map((r) => r.bookingId), direction === "ascending" ? ["a", "z", "missing"] : ["z", "a", "missing"]);
    }
  }
});

test("remaining headings sort the displayed values, not internal codes or email addresses", () => {
  const examples: [RegistrantColumn, Partial<RegistrantRow>, Partial<RegistrantRow>][] = [
    ["Workshop", { workshop: "Alpha" }, { workshop: "Zeta" }],
    ["Workshops", { workshop: "Alpha" }, { workshop: "Zeta" }],
    ["Decision", { status: "confirmed" }, { status: "pending" }],
    ["Decision", { status: "cancelled", withdrawn: true }, { status: "cancelled" }],
    ["Email", { email: "z@x.ca", letter: "owed" }, { email: "a@x.ca", letter: "sent" }],
    ["Email", { email: "", letter: "sent" }, { email: "a@x.ca", letter: "owed" }],
    ["Distance", { travel: "near" }, { travel: "far" }],
    ["Distance", { travel: "far", falseOot: true }, { travel: "near" }],
    ["Dietary", { dietary: ["Other"], dietaryOther: "Allergy" }, { dietary: ["Vegan"] }],
    ["Accessibility", { accessibility: "Access ramp" }, { accessibility: "Quiet room" }],
  ];
  for (const [column, a, z] of examples) {
    const shown = applyView([row({ ...z, bookingId: "z" }), row({ ...a, bookingId: "a" })], view("by-day"))[0].rows;
    assert.deepEqual(sortRegistrantRows(shown, { column, direction: "ascending" }, () => undefined).map((r) => r.bookingId), ["a", "z"], column);
    assert.deepEqual(sortRegistrantRows(shown, { column, direction: "descending" }, () => undefined).map((r) => r.bookingId), ["z", "a"], column);
  }
});

test("sorting preserves groups, equal-value order and each person's booking identities", () => {
  const groups = applyView(rows, view("distance"));
  const before = structuredClone(groups);
  const sorted = groups.map((g) => ({ ...g, rows: sortRegistrantRows(g.rows, { column: "Name", direction: "ascending" }, () => undefined) }));
  assert.deepEqual(groups, before);
  assert.deepEqual(sorted.map((g) => g.key), groups.map((g) => g.key));
  assert.deepEqual(sorted[0].rows[0].bookingIds, ["1", "2"]);
  const equal = applyView([row({ bookingId: "first" }), row({ bookingId: "second" })], view("by-workshop"))[0].rows;
  assert.deepEqual(sortRegistrantRows(equal, { column: "Name", direction: "descending" }, () => undefined).map((r) => r.bookingId), ["first", "second"]);
});

test("all nine built-in views exist and are valid", () => {
  assert.deepEqual(BUILT_IN_VIEWS.map((v) => v.id), ["all", "by-workshop", "by-day", "dietary", "approved", "declined", "waitlisted", "letters", "distance"]);
  for (const v of BUILT_IN_VIEWS) assert.ok(ViewSchema.safeParse(v).success, v.id);
});

test("decision and letter views filter", () => {
  assert.deepEqual(count(applyView(rows, view("approved"))), { GMP: 1 });
  assert.deepEqual(count(applyView(rows, view("declined"))), { GMP: 1 });
  assert.deepEqual(count(applyView(rows, view("waitlisted"))), { "RA 101": 1 });
  assert.deepEqual(count(applyView(rows, view("letters"))), { GMP: 1 });
});

test("email history is independent of the latest decision email and filters before folding people", () => {
  const historyRows = [
    row({ bookingId: "ack-only", personKey: "ack", status: "pending", letter: "none", hasEmailHistory: true }),
    row({ bookingId: "new-decision", personKey: "ack", status: "confirmed", letter: "owed", hasEmailHistory: true }),
    row({ bookingId: "manual-no-send", personKey: "manual", status: "confirmed", letter: "sent", hasEmailHistory: false }),
    row({ bookingId: "missing-email", personKey: "missing", email: "", hasEmailHistory: false }),
    row({ bookingId: "unchecked", personKey: "unknown" }),
  ];
  const emailed = ViewSchema.parse({ ...view("all"), filters: { emailHistory: "sent" } });
  const neverRecorded = ViewSchema.parse({ ...view("all"), filters: { emailHistory: "none" } });
  assert.deepEqual(applyView(historyRows, emailed)[0].rows.map((r) => r.bookingIds), [["ack-only", "new-decision"]]);
  assert.deepEqual(applyView(historyRows, neverRecorded)[0].rows.map((r) => r.bookingId), ["manual-no-send", "missing-email"]);
  assert.equal(applyView(historyRows, view("all"))[0].rows.length, 4);
  const stillOwed = { ...emailed, filters: { ...emailed.filters, letter: ["owed" as const] } };
  assert.deepEqual(applyView(historyRows, stillOwed)[0].rows[0].bookingIds, ["new-decision"]);
});

test("email-history filters survive saved views and older views default to Any", () => {
  const saved = { id: "contacted", name: "Already contacted", filters: { emailHistory: "sent" } };
  assert.equal(parseViews(JSON.stringify([saved]))[0].filters.emailHistory, "sent");
  assert.equal(parseViews(JSON.stringify([{ id: "old", name: "Old saved view", filters: {} }]))[0].filters.emailHistory, "");
  assert.equal(ViewSchema.safeParse({ ...saved, filters: { emailHistory: "invalid" } }).success, false);
});

test("by workshop / by day group seats", () => {
  assert.deepEqual(count(applyView(rows, view("by-workshop"))), { GMP: 3, "RA 101": 1 });
  assert.deepEqual(count(applyView(rows, view("by-day"))), { "Mon 26 Oct": 3, "Tue 27 Oct": 1 });
});

test("capacity links open By workshop with only the requested workshop, without mutating built-ins", () => {
  const selected = workshopRegistrantView("w2", ["w1", "w2"]);
  assert.equal(selected.id, "by-workshop");
  assert.equal(selected.perPerson, false);
  assert.deepEqual(count(applyView(rows, selected)), { "RA 101": 1 });
  assert.deepEqual(view("by-workshop").filters.workshopIds, []);
  for (const id of [null, "", "unknown"]) assert.equal(workshopRegistrantView(id, ["w1", "w2"]).id, "all");
});

test("dietary view counts people, and a person with two needs sits in both", () => {
  const g = count(applyView(rows, view("dietary")));
  assert.deepEqual(g, { Halal: 1, Vegan: 1, "No dietary requirements": 1, "Not answered": 1 });
});

test("distance view folds seats into people", () => {
  const g = applyView(rows, view("distance"));
  assert.deepEqual(count(g), { "Out of town (over 2 h)": 1, Local: 1, "Not answered": 1 });
  assert.deepEqual(g[0].rows[0].workshops, ["GMP", "RA 101"], "Ana's two workshops on one row");
});

test("accessibility filter and search", () => {
  const needs: View = ViewSchema.parse({ id: "x", name: "Needs", filters: { ...emptyFilters(), accessibility: "needs" } });
  assert.deepEqual(applyView(rows, needs)[0].rows.map((r) => r.bookingId), ["1", "2"]);
  const q: View = ViewSchema.parse({ id: "y", name: "Q", filters: { ...emptyFilters(), q: "halal" } });
  assert.equal(applyView(rows, q)[0].rows.length, 2);
});

test("saved views: junk and built-in ids are dropped, never fatal", () => {
  const good = { id: "mine", name: "Vegans on Monday", groupBy: "workshop", filters: { dietary: "Vegan", days: ["2026-10-26"] } };
  assert.deepEqual(parseViews(JSON.stringify([good, { id: "all", name: "hijack" }, { nope: 1 }])).map((v) => v.id), ["mine"]);
  assert.deepEqual(parseViews("not json"), []);
  assert.deepEqual(parseViews(null), []);
});


test("travel follow-up: one row per person who travels over 2 hours, with their sessions", () => {
  const t = travellers(rows);
  assert.deepEqual(t.map((x) => x.name), ["Ana"]);
  assert.equal(t[0].sessions.length, 2);
  assert.match(travellerCells(t[0])[5], /GMP \(approved\); Tue 27 Oct RA 101 \(waitlisted\)/);
});

test("the travel list says what the postal code implies, so a downtown claim is visible", () => {
  const cells = travellerCells({
    personKey: "p1", bookingId: "b1", name: "Ana", email: "a@x.ca", postcode: "M5S",
    sessions: [], appliedAt: new Date().toISOString(), falseOot: true, ootAccepted: false,
  });
  assert.equal(cells[3], "Toronto");
  assert.match(String(cells[4]), /under two hours/);
  // Nothing invented when they did not give one.
  const blank = travellerCells({ personKey: "p2", bookingId: "b2", name: "Bo", email: "b@x.ca", postcode: "", sessions: [], appliedAt: new Date().toISOString(), falseOot: false, ootAccepted: false });
  assert.equal(blank[3], "");
  assert.equal(blank[4], "");
});

test("CSV quotes what needs quoting", () => {
  assert.equal(toCsv([["a", "b,c", 'say "hi"', null, 3]]), 'a,"b,c","say ""hi""",,3');
});

test("a person's row carries every seat it stands for, so a tick can decide them all", () => {
  const rows = [
    row({ bookingId: "b1", personKey: "p1", workshopId: "w1", workshop: "One" }),
    row({ bookingId: "b2", personKey: "p1", workshopId: "w2", workshop: "Two" }),
    row({ bookingId: "b3", personKey: "p2", workshopId: "w1", workshop: "One" }),
  ];
  const [group] = applyView(rows, { ...BUILT_IN_VIEWS[0], perPerson: true });
  const mine = group.rows.find((r) => r.personKey === "p1")!;
  assert.deepEqual(mine.bookingIds, ["b1", "b2"]);
  assert.deepEqual(mine.workshopIds, ["w1", "w2"]);
  // A seat row stands for itself and nothing else.
  const seats = applyView(rows, { ...BUILT_IN_VIEWS[0], perPerson: false })[0];
  assert.deepEqual(seats.rows.map((r) => r.bookingIds), [["b1"], ["b2"], ["b3"]]);
});
