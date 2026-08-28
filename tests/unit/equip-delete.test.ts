import test from "node:test";
import assert from "node:assert/strict";
import { canDelete } from "../../src/lib/equip/delete";

const draft = { status: "draft", approvedAmount: null };
const submitted = { status: "submitted", approvedAmount: null };
const underReview = { status: "under_review", approvedAmount: null };
const approved = { status: "approved", approvedAmount: 2400 };
const funded = { status: "funded", approvedAmount: 2400 };
const rejected = { status: "rejected", approvedAmount: null };

test("an applicant may delete their own draft", () => {
  assert.equal(canDelete(draft, "owner", false).allowed, true);
});

test("an applicant may not delete something already with the team", () => {
  for (const app of [submitted, underReview]) {
    const v = canDelete(app, "owner", false);
    assert.equal(v.allowed, false);
    assert.match(v.reason, /with the EQUIP team|withdraw/i);
    assert.doesNotMatch(v.reason, /^$/);
  }
});

test("an applicant may not delete a decided one", () => {
  assert.equal(canDelete(approved, "owner", true).allowed, false, "not even if they say confirm");
  assert.equal(canDelete(funded, "owner", true).allowed, false);
});

test("an admin may delete a draft or a rejection without ceremony", () => {
  for (const app of [draft, submitted, underReview, rejected]) {
    const v = canDelete(app, "admin", false);
    assert.equal(v.allowed, true, `${app.status} should be deletable`);
    assert.equal(v.needsConfirm, false);
  }
});

test("THE ONE THAT MATTERS: deleting an approved one is refused until confirmed", () => {
  // The $5,000 cap is a live sum over surviving rows, so deleting an
  // approved application hands its allowance back. That must be a
  // decision, not a side effect discovered later.
  const v = canDelete(approved, "admin", false);
  assert.equal(v.allowed, false);
  assert.equal(v.needsConfirm, true);
  assert.equal(v.affectsCap, true);
  assert.match(v.reason, /\$2,400/);
  assert.match(v.reason, /allowance/i);
});

test("and goes ahead once it is", () => {
  const v = canDelete(approved, "admin", true);
  assert.equal(v.allowed, true);
  assert.equal(v.affectsCap, true, "still true — the caller should still say so afterwards");
});

test("an approved application with no amount does not need the ceremony", () => {
  // Nothing to hand back, so nothing to warn about.
  const v = canDelete({ status: "approved", approvedAmount: 0 }, "admin", false);
  assert.equal(v.allowed, true);
  assert.equal(v.needsConfirm, false);
});

test("a refusal always says why", () => {
  for (const [app, actor] of [[submitted, "owner"], [approved, "owner"], [approved, "admin"]] as const) {
    const v = canDelete(app, actor, false);
    assert.equal(v.allowed, false);
    assert.ok(v.reason.length > 20, "a refusal with no explanation is a dead end");
  }
});
