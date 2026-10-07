import test from "node:test";
import assert from "node:assert/strict";
import { applicantFor } from "../../src/lib/allocation/applicants";
import { DEFAULT_RULES, parseRules, rankApplicants, withPreferenceRule } from "../../src/lib/allocation/model";
import { seatApprovalProblem, seatPersonKey, sessionsOverlap, suggestWeekSeats, type SuggestionWorkshop } from "../../src/lib/allocation/seat-suggestions";

const booking = (id: string, person = "a", preference: number | null = 1, status = "pending"): SuggestionWorkshop["bookings"][number] => ({
  id, status, registrant: { personKey: person },
  applicant: applicantFor({ bookingId: id, preference, status, bookedAt: "2026-09-01T10:00:00Z", seatsHeld: 0,
    roster: () => undefined, submission: { email: `${person}@example.org`, data: {}, createdAt: "2026-09-01T10:00:00Z" } }),
});
const workshop = (id: string, bookings: SuggestionWorkshop["bookings"], start = "10:00", end = "11:00", capacity = 1): SuggestionWorkshop => ({
  id, title: id, isActive: true, capacity, bookings,
  startDateTime: `2026-10-26T${start}:00Z`, endDateTime: `2026-10-26T${end}:00Z`,
});
const plan = (...workshops: SuggestionWorkshop[]) => suggestWeekSeats(workshops, DEFAULT_RULES);

test("ranks 1 through 5 are considered before arrival time, with unknown choices last", () => {
  const bookings = [5, 3, 1, 4, 2, null].map((rank, index) => booking(`b${index}`, `p${index}`, rank));
  bookings[0].applicant.appliedAt = "2026-08-01T10:00:00Z";
  assert.deepEqual(rankApplicants(bookings.map((b) => b.applicant), DEFAULT_RULES, 6).map((r) => r.applicant.preference), [1, 2, 3, 4, 5, null]);
  assert.equal(plan(workshop("w", bookings)).get("b2")?.suggestion, "approve");
});

test("legacy saved rules gain preference before first-come; an explicit disable is preserved", () => {
  const legacy = DEFAULT_RULES.filter((r) => r.kind !== "preference");
  assert.deepEqual(parseRules(JSON.stringify(legacy)).map((r) => r.kind), ["out_of_town", "preference", "first_come"]);
  const off = DEFAULT_RULES.map((r) => r.kind === "preference" ? { ...r, isActive: false } : r);
  assert.deepEqual(withPreferenceRule(off), off);
});

test("the higher-ranked overlapping choice wins, regardless of workshop order", () => {
  const a = workshop("A", [booking("low", "a", 4), booking("other", "b", 5)]);
  const b = workshop("B", [booking("best", "a", 1)]);
  for (const inputs of [[a, b], [b, a]]) {
    const result = plan(...inputs);
    assert.equal(result.get("best")?.suggestion, "approve");
    assert.equal(result.get("low")?.suggestion, "waitlist");
    assert.match(result.get("low")!.reason, /Conflicts with B/);
    assert.equal(result.get("other")?.suggestion, "approve", "blocked person does not consume the remaining seat");
  }
});

test("a full first choice falls back to the next eligible choice", () => {
  const result = plan(workshop("A", [booking("held", "b", 1, "confirmed"), booking("first", "a", 1)]), workshop("B", [booking("second", "a", 2)]));
  assert.equal(result.get("first")?.suggestion, "waitlist");
  assert.equal(result.get("second")?.suggestion, "approve");
  assert.equal(result.get("held")?.suggestion, null);
});

test("existing confirmations block pending and waitlist requests even with a better preference", () => {
  for (const status of ["pending", "waitlist"]) {
    const result = plan(workshop("A", [booking("held", "a", 5, "confirmed")]), workshop("B", [booking("first", "a", 1, status)]));
    assert.equal(result.get("first")?.suggestion, status === "pending" ? "waitlist" : null);
    assert.match(result.get("first")!.reason, /Conflicts with A/);
  }
});

test("back-to-back and separate-day sessions are allowed; partial overlaps are not", () => {
  const a = workshop("A", [booking("a", "a")], "10:00", "11:00");
  const b = workshop("B", [booking("b", "a", 2)], "11:00", "12:00");
  const c = workshop("C", [booking("c", "a", 3)], "10:30", "11:30");
  const d = { ...a, id: "D", bookings: [booking("d", "a", 4)], startDateTime: "2026-10-27T10:00:00Z", endDateTime: "2026-10-27T11:00:00Z" };
  const result = plan(a, b, c, d);
  assert.equal(result.get("a")?.suggestion, "approve");
  assert.equal(result.get("b")?.suggestion, "approve");
  assert.equal(result.get("c")?.suggestion, "waitlist");
  assert.equal(result.get("d")?.suggestion, "approve");
  assert.equal(sessionsOverlap(a, b), false);
});

test("UTC offsets and sessions crossing midnight are compared as instants", () => {
  assert.equal(sessionsOverlap({ startDateTime: "2026-10-26T23:30:00-04:00", endDateTime: "2026-10-27T01:00:00-04:00" }, { startDateTime: "2026-10-27T04:00:00Z", endDateTime: "2026-10-27T06:00:00Z" }), true);
});

test("duplicate registrations are one person by normalized email, not submission id", () => {
  const a = booking("a", "submission1", 1), b = booking("b", "submission2", 2);
  a.applicant.email = "Jane.Doe@gmail.com"; b.applicant.email = " janedoe+training@googlemail.com ";
  assert.equal(seatPersonKey(a.applicant.email, "one"), seatPersonKey(b.applicant.email, "two"));
  const result = plan(workshop("A", [a]), workshop("B", [b]));
  assert.equal(result.get("a")?.suggestion, "approve");
  assert.equal(result.get("b")?.suggestion, "waitlist");
});

test("staff do not consume trainee capacity; withdrawn and cancelled seats are not suggested", () => {
  const staff = { ...booking("staff", "staff", 1, "confirmed"), internal: true };
  const result = plan(workshop("A", [staff, { ...booking("withdrawn"), withdrawn: true }, booking("cancelled", "c", 1, "cancelled"), booking("live", "b")]));
  assert.equal(result.get("live")?.suggestion, "approve");
  assert.equal(result.get("withdrawn")?.suggestion, null);
  assert.equal(result.get("cancelled")?.suggestion, null);
});

test("inactive, invalid-time and zero-capacity sessions are never suggested for approval", () => {
  for (const extra of [{ isActive: false }, { startDateTime: "bad" }, { endDateTime: "2026-10-25T00:00:00Z" }, { capacity: 0 }]) {
    assert.notEqual(plan({ ...workshop("A", [booking("a")]), ...extra }).get("a")?.suggestion, "approve");
  }
});

test("existing conflicting confirmations are kept but flagged", () => {
  const result = plan(workshop("A", [booking("a", "a", 1, "confirmed")]), workshop("B", [booking("b", "a", 2, "confirmed")]));
  assert.equal(result.get("a")?.suggestion, null);
  assert.match(result.get("a")!.reason, /Existing confirmed conflict/);
});

test("saved priority rules still precede preferences", () => {
  const far = booking("far", "far", 5); far.applicant.isOutOfTown = true;
  const result = plan(workshop("A", [booking("local", "local", 1), far]));
  assert.equal(result.get("far")?.suggestion, "approve");
});

test("fewest-seats policy counts seats suggested in this run", () => {
  const a = booking("a", "a", 1), b = booking("b", "a", 2), c = booking("c", "b", 3);
  const rules = [{ id: "fair", kind: "fewest_seats_held" as const, label: "Fewest seats", isActive: true }, ...DEFAULT_RULES];
  const result = suggestWeekSeats([workshop("A", [a]), workshop("B", [b, c], "12:00", "13:00")], rules);
  assert.equal(result.get("a")?.suggestion, "approve");
  assert.equal(result.get("c")?.suggestion, "approve");
});

test("approval guard rechecks a newly confirmed conflict or newly filled room", () => {
  const target = { id: "target", personKey: "a", workshop: workshop("A", []) };
  assert.equal(seatApprovalProblem(target, []), null);
  assert.match(seatApprovalProblem(target, [{ id: "new", personKey: "a", workshop: workshop("B", []) }])!, /Conflicts/);
  assert.equal(seatApprovalProblem(target, [{ id: "new", personKey: "b", workshop: target.workshop }]), "No seats remaining.");
});
