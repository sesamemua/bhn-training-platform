import test from "node:test";
import assert from "node:assert/strict";
import {
  EQUIP_OPEN_STATUSES,
  INSIGHTS_EVENT_SLUG,
  SYMPOSIUM_EVENT_SLUG,
  WORKSPACE_BADGE_KEYS,
  comingUpWindow,
  equipOpenWhere,
  equipStalledWhere,
  piecesSubmittedWhere,
  reminderNeedsAttention,
  remindersAttentionWhere,
  rosterStale,
  socialAttentionWhere,
  socialNeedsAttention,
  speakersNewWhere,
  speakersSeenKey,
  torontoToday,
  trainingBookingsPendingWhere,
  workspaceTotal,
} from "../../src/lib/admin/workspace-queue-rules";

const now = new Date("2026-09-08T15:00:00Z");
const hour = 3_600_000;
const day = 24 * hour;

test("social: a draft always needs a person, whatever its send time", () => {
  assert.equal(socialNeedsAttention({ status: "draft", scheduledFor: new Date(now.getTime() + 10 * day) }, now), true);
  assert.equal(socialNeedsAttention({ status: "draft", scheduledFor: new Date(now.getTime() - 10 * day) }, now), true);
});

test("social: approved and scheduled posts need a person only once the send time has passed", () => {
  for (const status of ["approved", "scheduled"]) {
    assert.equal(socialNeedsAttention({ status, scheduledFor: new Date(now.getTime() + hour) }, now), false, status);
    assert.equal(socialNeedsAttention({ status, scheduledFor: new Date(now.getTime() - hour) }, now), true, status);
  }
});

test("social: published and skipped never do, even long past their send time", () => {
  for (const status of ["published", "skipped"]) {
    assert.equal(socialNeedsAttention({ status, scheduledFor: new Date(now.getTime() - 30 * day) }, now), false, status);
  }
});

test("social: the where clause is the predicate, not a second opinion", () => {
  const where = socialAttentionWhere(now);
  assert.deepEqual(where, {
    OR: [
      { status: "draft" },
      { status: { in: ["approved", "scheduled"] }, scheduledFor: { lt: now } },
    ],
  });
});

test("newsletter: a failed reminder always needs a person; a pending one only once its day has come", () => {
  const today = "2026-09-08";
  assert.equal(reminderNeedsAttention({ status: "failed", scheduledFor: "2026-12-25" }, today), true);
  assert.equal(reminderNeedsAttention({ status: "pending", scheduledFor: "2026-09-07" }, today), true);
  assert.equal(reminderNeedsAttention({ status: "pending", scheduledFor: "2026-09-08" }, today), true);
  assert.equal(reminderNeedsAttention({ status: "pending", scheduledFor: "2026-09-09" }, today), false);
  assert.equal(reminderNeedsAttention({ status: "sent", scheduledFor: "2026-09-01" }, today), false);
  assert.equal(reminderNeedsAttention({ status: "skipped", scheduledFor: "2026-09-01" }, today), false);
  assert.deepEqual(remindersAttentionWhere(today), {
    OR: [{ status: "failed" }, { status: "pending", scheduledFor: { lte: today } }],
  });
});

test("newsletter: submitted pieces count only inside the issue being produced", () => {
  assert.deepEqual(piecesSubmittedWhere("issue-1"), { status: "submitted", issueId: "issue-1" });
  assert.equal(piecesSubmittedWhere(null), null);
});

test("today is the Toronto calendar, not UTC", () => {
  // 02:30Z on the 9th is still the evening of the 8th in Toronto.
  assert.equal(torontoToday(new Date("2026-09-09T02:30:00Z")), "2026-09-08");
  assert.equal(torontoToday(new Date("2026-09-09T12:00:00Z")), "2026-09-09");
});

test("speakers: never opened the page → every intake submission is new; opened → only newer ones", () => {
  assert.deepEqual(speakersNewWhere(INSIGHTS_EVENT_SLUG, null), {
    event: { slug: INSIGHTS_EVENT_SLUG },
    submittedAt: { not: null },
  });
  const seen = new Date("2026-09-01T00:00:00Z");
  assert.deepEqual(speakersNewWhere(SYMPOSIUM_EVENT_SLUG, seen), {
    event: { slug: SYMPOSIUM_EVENT_SLUG },
    submittedAt: { gt: seen },
  });
  assert.equal(speakersSeenKey("2026-annual-symposium"), "speakersSeenAt:2026-annual-symposium");
  assert.notEqual(speakersSeenKey(INSIGHTS_EVENT_SLUG), speakersSeenKey(SYMPOSIUM_EVENT_SLUG));
});

test("equip: the review queue is what a reviewer can act on — not pre_screen_approved, which is the applicant's turn", () => {
  assert.deepEqual([...EQUIP_OPEN_STATUSES], ["submitted", "under_review"]);
  assert.deepEqual(equipOpenWhere(), { status: { in: ["submitted", "under_review"] } });
  const stalled = equipStalledWhere(now) as { OR: { status: string; submittedAt?: { lt: Date }; reviewedAt?: { lt: Date } }[] };
  assert.equal(stalled.OR[0].status, "submitted");
  assert.equal(stalled.OR[0].submittedAt?.lt.getTime(), now.getTime() - 7 * day);
  assert.equal(stalled.OR[1].status, "under_review");
  assert.equal(stalled.OR[1].reviewedAt?.lt.getTime(), now.getTime() - 14 * day);
});

test("training week: the queue is pending workshop bookings on the symposium event, not the form's reviewStatus", () => {
  assert.deepEqual(trainingBookingsPendingWhere(), {
    status: "pending",
    workshop: { event: { slug: "2026-annual-symposium" } },
  });
});

test("eligibility: stale follows the gate — loaded and older than 72 h", () => {
  assert.equal(rosterStale({ total: 120, lastImportAt: new Date(now.getTime() - 4 * day) }, now), true);
  assert.equal(rosterStale({ total: 120, lastImportAt: new Date(now.getTime() - 1 * day) }, now), false);
  assert.equal(rosterStale({ total: 0, lastImportAt: null }, now), false);
});

test("total sums every lane and never counts itself", () => {
  const counts = {
    "equip-review": 2,
    "social-attention": 0,
    "speakers-new-symposium": 1,
    "speakers-new-insights": 8,
    "training-bookings-pending": 3,
    "newsletter-attention": 2,
    "workspace-total": 999,
  } as const;
  assert.equal(workspaceTotal(counts), 16);
  assert.equal(workspaceTotal({}), 0);
  assert.ok(WORKSPACE_BADGE_KEYS.includes("workspace-total"));
});

test("coming-up window starts now and runs N days", () => {
  const w = comingUpWindow(now, 30);
  assert.equal(w.from.getTime(), now.getTime());
  assert.equal(w.to.getTime(), now.getTime() + 30 * day);
  assert.equal(comingUpWindow(now).to.getTime(), now.getTime() + 30 * day);
});
