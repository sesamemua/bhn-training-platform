/** Registrant views: built-ins, filters, grouping, per-person folding, saved views. */
import test from "node:test";
import assert from "node:assert/strict";
import {
  BUILT_IN_VIEWS, ViewSchema, applyView, emptyFilters, parseViews, type RegistrantRow, type View,
} from "../../src/lib/allocation/registrant-views";

const row = (o: Partial<RegistrantRow>): RegistrantRow => ({
  bookingId: "b", personKey: "p", name: "N", email: "n@x.ca", workshopId: "w1", workshop: "GMP", day: "2026-10-26",
  dayLabel: "Mon 26 Oct", status: "pending", letter: "none", travel: "unknown", postcode: "", dietary: [],
  dietaryOther: "", accessibility: "", preference: 1, appliedAt: "2026-09-20T10:00:00Z", ...o,
});
const rows = [
  row({ bookingId: "1", personKey: "ana", name: "Ana", status: "confirmed", letter: "owed", travel: "far", dietary: ["Vegan", "Halal"], accessibility: "Wheelchair access" }),
  row({ bookingId: "2", personKey: "ana", name: "Ana", workshopId: "w2", workshop: "RA 101", day: "2026-10-27", dayLabel: "Tue 27 Oct", status: "waitlist", travel: "far", dietary: ["Vegan", "Halal"], accessibility: "Wheelchair access" }),
  row({ bookingId: "3", personKey: "ben", name: "Ben", status: "cancelled", letter: "sent", travel: "near", dietary: ["No dietary requirements"], accessibility: "none" }),
  row({ bookingId: "4", personKey: "cy", name: "Cy", status: "pending" }),
];
const view = (id: string) => BUILT_IN_VIEWS.find((v) => v.id === id)!;
const count = (g: ReturnType<typeof applyView>) => Object.fromEntries(g.map((x) => [x.label, x.rows.length]));

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

test("by workshop / by day group seats", () => {
  assert.deepEqual(count(applyView(rows, view("by-workshop"))), { GMP: 3, "RA 101": 1 });
  assert.deepEqual(count(applyView(rows, view("by-day"))), { "Mon 26 Oct": 3, "Tue 27 Oct": 1 });
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
