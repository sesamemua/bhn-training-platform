import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { applicantFor } from "../../src/lib/allocation/applicants";
import type { AdminBooking, AdminWorkshop } from "../../src/lib/allocation/admin-types";
import { DEFAULT_RULES } from "../../src/lib/allocation/model";
import { projectWeekSeats } from "../../src/lib/allocation/seat-projection";
import { suggestWeekSeats } from "../../src/lib/allocation/seat-suggestions";
import { SeatProjection } from "../../src/components/training-week/SeatProjection";

const booking = (id: string, person = id, preference = 1, status = "pending"): AdminBooking => ({
  id, status, approvedAt: null, bookedAt: "2026-09-01T10:00:00Z", waitlistPosition: null, user: null, letterOwed: false,
  registrant: { personKey: person, dietary: [], dietaryOther: "", accessibility: "", postcode: "" },
  applicant: applicantFor({ bookingId: id, preference, status, bookedAt: "2026-09-01T10:00:00Z", seatsHeld: 0,
    roster: () => undefined, submission: { email: `${person}@example.org`, data: {}, createdAt: "2026-09-01T10:00:00Z" } }),
});
const workshop = (id: string, bookings: AdminBooking[], capacity = 1, start = "10:00"): AdminWorkshop => ({
  id, slug: id, title: id, kind: "workshop", capacity, waitlistCapacity: 5, requiresApproval: true, isActive: true,
  startDateTime: `2026-10-26T${start}:00Z`, endDateTime: `2026-10-26T${start === "10:00" ? "11:00" : "13:00"}:00Z`,
  locationName: null, partnerOrganization: null, shortDescription: null, bookings,
});
const project = (workshops: AdminWorkshop[]) => projectWeekSeats(workshops, DEFAULT_RULES);

test("oversubscribed demand is not treated as attendance; forecast exactly follows suggestions", () => {
  const w = workshop("A", [booking("a"), booking("b"), booking("c")], 2);
  const before = JSON.stringify(w);
  const forecast = project([w]);
  const plan = suggestWeekSeats([w], DEFAULT_RULES);
  assert.equal(forecast.rows[0].requested, 3);
  assert.equal(forecast.rows[0].approved, 0);
  assert.equal(forecast.rows[0].suggested, [...plan.values()].filter((s) => s.suggestion === "approve").length);
  assert.equal(forecast.rows[0].projectedApproved, 2);
  assert.equal(forecast.rows[0].projectedWaitlisted, 1);
  assert.equal(forecast.rows[0].remaining, 0);
  assert.equal(JSON.stringify(w), before, "forecast must not mutate bookings");
});

test("overlapping rankings leave unused capacity rather than approving one person twice", () => {
  const a = workshop("A", [booking("first", "person", 1)]);
  const b = workshop("B", [booking("second", "person", 2)]);
  const rows = project([b, a]).rows;
  assert.equal(rows[0].projectedApproved, 0);
  assert.equal(rows[0].projectedWaitlisted, 1);
  assert.equal(rows[0].remaining, 1);
  assert.equal(rows[1].projectedApproved, 1);
  assert.equal(project([a, { ...b, startDateTime: "2026-10-26T11:00:00Z", endDateTime: "2026-10-26T12:00:00Z" }]).totals.projectedApproved, 2);
});

test("actual confirmations count once and waitlist promotions leave the projected waitlist", () => {
  const row = project([workshop("A", [booking("held", "held", 1, "confirmed"), booking("promoted", "next", 1, "waitlist"), booking("waiting", "last", 5, "waitlist")], 2)]).rows[0];
  assert.equal(row.approved, 1);
  assert.equal(row.suggested, 1);
  assert.equal(row.projectedApproved, 2);
  assert.equal(row.projectedWaitlisted, 1);
});

test("staff are separate, withdrawn and cancelled requests excluded, inactive rooms still block conflicts", () => {
  const active = workshop("A", [booking("blocked", "same"), booking("live"), { ...booking("staff", "staff", 1, "confirmed"), internal: true }, { ...booking("gone"), withdrawn: true }, booking("cancelled", "cancelled", 1, "cancelled")]);
  const inactive = { ...workshop("B", [booking("held", "same", 1, "confirmed")]), isActive: false };
  const result = project([active, inactive]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.totals.requested, 2);
  assert.equal(result.totals.projectedApproved, 1);
  assert.equal(result.totals.projectedWaitlisted, 1);
  assert.equal(result.totals.internal, 1);
});

test("existing excess approvals and time conflicts remain visible, not silently capped", () => {
  const result = project([
    workshop("A", [booking("one", "same", 1, "confirmed"), booking("two", "other", 1, "confirmed")]),
    workshop("B", [booking("three", "same", 1, "confirmed")]),
  ]);
  assert.equal(result.rows[0].projectedApproved, 2);
  assert.equal(result.rows[0].remaining, 0);
  assert.match(result.rows[0].warnings.join(" "), /over capacity/);
  assert.match(result.rows[0].warnings.join(" "), /Existing confirmed conflict/);
});

test("zero capacity and invalid times cannot become projected approvals", () => {
  const result = project([workshop("A", [booking("a")], 0), { ...workshop("B", [booking("b")]), startDateTime: "invalid" }]);
  assert.equal(result.totals.projectedApproved, 0);
  assert.equal(result.totals.projectedWaitlisted, 2);
});

test("saved policy priorities are reused and updated capacity recomputes the forecast", () => {
  const far = booking("far", "same", 5); far.applicant.isOutOfTown = true;
  const a = workshop("A", [far, booking("local", "local", 1)]);
  const b = workshop("B", [booking("second", "same", 1)]);
  assert.equal(project([a, b]).rows[1].projectedApproved, 0);
  assert.equal(project([{ ...a, capacity: 2 }, b]).rows[0].projectedApproved, 2);
});

test("invalid saved model suppresses projections and preserves actual counts", () => {
  const workshops = [workshop("A", [booking("held", "held", 1, "confirmed"), booking("pending")], 3)];
  const projection = projectWeekSeats(workshops, []);
  assert.match(projection.problem!, /switched off/);
  assert.equal(projection.rows[0].approved, 1);
  assert.equal(projection.rows[0].suggested, 0);
  const html = renderToStaticMarkup(<SeatProjection projection={projection} workshops={workshops} onReview={() => {}} onCapacity={() => {}} />);
  assert.match(html, /role="alert"/);
  assert.match(html, /Projection unavailable/);
  assert.doesNotMatch(html, /role="img"/);
});

test("rendered dashboard distinguishes actual and projected counts and stays read-only", () => {
  const workshops = [workshop("Workshop", [booking("a"), booking("b")])];
  const html = renderToStaticMarkup(<SeatProjection projection={project(workshops)} workshops={workshops} onReview={() => {}} onCapacity={() => {}} />);
  for (const label of ["Approved now", "Suggested additions", "Projected approvals", "Projected waitlist", "No decisions have been applied", "1 projected approvals of 1 seats", "not unique people", "overflow-x-auto"]) assert.ok(html.includes(label), label);
  assert.doesNotMatch(html, />Apply</);
  assert.match(html, /scope="col"/);
});

test("empty workshops give an explicit empty state and zero totals", () => {
  const projection = project([]);
  assert.equal(projection.totals.projectedApproved, 0);
  const html = renderToStaticMarkup(<SeatProjection projection={projection} workshops={[]} onReview={() => {}} onCapacity={() => {}} />);
  assert.match(html, /No active workshops/);
});
