import test from "node:test";
import assert from "node:assert/strict";
import {
  VC_DOLLAR_CAP, VC_APPLICATION_CAP, priorApprovalsWhere, capStateFrom,
  checkApproval, varianceOf, totalVariance, type PriorAward,
} from "../../src/lib/equip/cap";

const award = (o: Partial<PriorAward> = {}): PriorAward => ({
  id: "a", status: "funded", requestedAmount: 2000, approvedAmount: 2000,
  actualAmount: null, decidedAt: new Date("2026-01-01"), ...o,
});

// ── Who the caps attach to ─────────────────────────────────────────────

test("an account holder is matched by account, not by address", () => {
  const w = priorApprovalsWhere({ id: "x", userId: "u1", applicantEmail: "a@b.ca", stream: "venture_connect" });
  assert.equal((w as { userId?: string }).userId, "u1");
  assert.ok(!("applicantEmail" in w));
});

test("a public applicant is matched by address, never by the null account", () => {
  /*
   * The bug this pins: `userId: null` alone matches every OTHER public
   * application — everybody's, not theirs. It fails silently, refusing
   * somebody because strangers were funded.
   */
  const w = priorApprovalsWhere({ id: "x", userId: null, applicantEmail: "a@b.ca", stream: "venture_connect" });
  assert.equal((w as { userId?: null }).userId, null);
  assert.deepEqual((w as { applicantEmail?: unknown }).applicantEmail,
    { equals: "a@b.ca", mode: "insensitive" });
});

test("no account and no address attributes nothing rather than EVERYTHING", () => {
  /*
   * The bug this pins, which was live: the guard clause was spread into
   * an object that then set `id` again, wiping it out. The query became
   * "every approved VentureConnect application", so one anonymous
   * applicant carried the whole programme's spend against their cap and
   * was refused because strangers had been funded.
   */
  const w = priorApprovalsWhere({ id: "x", userId: null, applicantEmail: null, stream: "venture_connect" });
  const and = (w as { AND?: unknown[] }).AND;
  assert.ok(Array.isArray(and), "must be an unsatisfiable AND, not a clobberable key");
  // It has to be genuinely impossible: id = x AND id != x.
  assert.deepEqual(and[1], { id: "x" });
  assert.deepEqual(and[2], { id: { not: "x" } });
  // And it must not have leaked a plain userId:null that matches everyone.
  assert.equal((w as { userId?: unknown }).userId, undefined);
});

test("only approved and funded consume a cap; a rejection must not burn a slot", () => {
  const w = priorApprovalsWhere({ id: "x", userId: "u1", applicantEmail: null, stream: "venture_connect" });
  assert.deepEqual((w as { status?: unknown }).status, { in: ["approved", "funded"] });
});

test("the application itself is excluded, or it would count against its own cap", () => {
  const w = priorApprovalsWhere({ id: "self", userId: "u1", applicantEmail: null, stream: "venture_connect" });
  assert.deepEqual((w as { id?: unknown }).id, { not: "self" });
});

// ── The two limits ─────────────────────────────────────────────────────

test("a fresh applicant has the whole cap and all three slots", () => {
  const s = capStateFrom([]);
  assert.equal(s.dollarsLeft, VC_DOLLAR_CAP);
  assert.equal(s.slotsLeft, VC_APPLICATION_CAP);
  assert.equal(checkApproval(s, 5000), null);
});

test("the dollar cap blocks an over-award", () => {
  const s = capStateFrom([award({ approvedAmount: 4000 })]);
  assert.equal(s.dollarsLeft, 1000);
  assert.equal(checkApproval(s, 1000), null);
  const block = checkApproval(s, 1001);
  assert.equal(block?.reason, "dollars");
  assert.match(block!.message, /\$1,000 remains/);
});

test("THE NEW RULE: three funded applications blocks a fourth at any amount", () => {
  const s = capStateFrom([
    award({ id: "1", approvedAmount: 500 }),
    award({ id: "2", approvedAmount: 500 }),
    award({ id: "3", approvedAmount: 500 }),
  ]);
  assert.equal(s.slotsUsed, 3);
  assert.equal(s.slotsLeft, 0);
  assert.ok(s.atApplicationCap);
  // $3,500 of headroom left, and it does not matter.
  assert.equal(s.dollarsLeft, 3500);
  const block = checkApproval(s, 1);
  assert.equal(block?.reason, "slots");
});

test("the slot block is reported ahead of the dollar one", () => {
  /*
   * Otherwise an applicant at 3 awards with headroom left is told
   * "$3,500 remains" — a near-miss that is simply false, and a reviewer
   * would reasonably try to approve $3,000 and not understand the refusal.
   */
  const s = capStateFrom([award({ id: "1" }), award({ id: "2" }), award({ id: "3" })]);
  const block = checkApproval(s, 10_000);
  assert.equal(block?.reason, "slots");
  assert.ok(!("remaining" in block!));
});

test("headroom is measured against approved, not against what was spent", () => {
  // Approved $4,000, only $1,000 actually spent. The $3,000 unspent does
  // NOT reopen. Deliberate: releasing it is a policy call nobody made,
  // and the safe direction for a cap is the one that cannot over-award.
  const s = capStateFrom([award({ approvedAmount: 4000, actualAmount: 1000 })]);
  assert.equal(s.approvedToDate, 4000);
  assert.equal(s.actualToDate, 1000);
  assert.equal(s.dollarsLeft, 1000);
});

// ── Variance ───────────────────────────────────────────────────────────

test("the two gaps mean different things and stay separate", () => {
  // Asked $3,000, granted $2,000, spent $1,500.
  const v = varianceOf({ requestedAmount: 3000, approvedAmount: 2000, actualAmount: 1500 });
  assert.equal(v.reviewDelta, -1000);  // the committee trimmed $1,000
  assert.equal(v.spendDelta, -500);    // $500 came back unspent
  assert.equal(v.utilisation, 0.75);
  assert.ok(v.reconciled);
});

test("an unreconciled application reports no spend delta rather than a zero", () => {
  // A zero would read as "spent exactly what was granted", which is a
  // claim about an outcome nobody has checked.
  const v = varianceOf({ requestedAmount: 3000, approvedAmount: 2000, actualAmount: null });
  assert.equal(v.spendDelta, null);
  assert.equal(v.utilisation, null);
  assert.equal(v.reconciled, false);
});

test("an over-spend shows as a positive delta", () => {
  const v = varianceOf({ requestedAmount: 2000, approvedAmount: 2000, actualAmount: 2300 });
  assert.equal(v.spendDelta, 300);
  assert.equal(v.utilisation, 1.15);
});

test("the applicant total compares actuals only against the awards they belong to", () => {
  /*
   * One reconciled at $800 of $1,000, one still open at $2,000. Naively
   * summing gives actual $800 against approved $3,000 and a −$2,200
   * spend delta, which reads as though $2,200 came back. It has not: it
   * has not been checked.
   */
  const t = totalVariance([
    { requestedAmount: 1000, approvedAmount: 1000, actualAmount: 800 },
    { requestedAmount: 2000, approvedAmount: 2000, actualAmount: null },
  ]);
  assert.equal(t.approved, 3000);
  assert.equal(t.actual, 800);
  assert.equal(t.spendDelta, -200, "compared against the $1,000 that was reconciled");
  assert.equal(t.reconciled, false);
});

test("a fully reconciled applicant reports as reconciled", () => {
  const t = totalVariance([
    { requestedAmount: 1000, approvedAmount: 1000, actualAmount: 900 },
    { requestedAmount: 2000, approvedAmount: 1500, actualAmount: 1500 },
  ]);
  assert.equal(t.reviewDelta, -500);   // $3,000 asked, $2,500 granted
  assert.equal(t.spendDelta, -100);
  assert.ok(t.reconciled);
});

test("no applications at all is not a reconciled state", () => {
  assert.equal(totalVariance([]).reconciled, false);
});
