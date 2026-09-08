import test from "node:test";
import assert from "node:assert/strict";
import { REMINDER_LADDER, postKey, type CycleFacts, type Recipient } from "../../src/lib/social/types";
import { daysBetween, isOverdue, planCycle, planRecipients, readableDate, sendTimeFor } from "../../src/lib/social/plan";
import { draftPost } from "../../src/lib/social/copy";

const facts: CycleFacts = {
  stream: "venture_connect",
  deadlineId: "dl_oct",
  cycleLabel: "October 2026",
  deadlineAt: new Date("2026-10-26T23:59:00.000Z"),
  originalDeadlineAt: new Date("2026-10-26T23:59:00.000Z"),
  maxAward: 5000,
  applyPath: "/apply/venture-connect",
};
const NOW = new Date("2026-10-01T15:00:00.000Z");

/* ── The ladder ─────────────────────────────────────────────────── */

test("a cycle plans one launch and one reminder per rung", () => {
  const posts = planCycle(facts, NOW);
  assert.equal(posts.filter((p) => p.kind === "launch").length, 1);
  assert.equal(posts.filter((p) => p.kind === "reminder").length, REMINDER_LADDER.length);
  assert.deepEqual(
    posts.filter((p) => p.kind === "reminder").map((p) => p.daysBefore),
    [...REMINDER_LADDER],
  );
});

test("every planned post has a distinct key, so the daily run cannot duplicate one", () => {
  const keys = planCycle(facts, NOW).map(postKey);
  assert.equal(new Set(keys).size, keys.length);
});

test("a reminder is scheduled the stated number of days before the deadline", () => {
  for (const p of planCycle(facts, NOW).filter((x) => x.kind === "reminder")) {
    assert.equal(
      daysBetween(p.scheduledFor, facts.deadlineAt),
      p.daysBefore,
      `the ${p.daysBefore}-day reminder should be ${p.daysBefore} days out`,
    );
  }
});

test("extending the deadline moves every reminder with it", () => {
  // The whole reason this lives in the platform. Nothing has a date
  // typed into it, so a later deadline cannot leave a stale post behind.
  const before = planCycle(facts, NOW).filter((p) => p.kind === "reminder");
  const extended = { ...facts, deadlineAt: new Date("2026-11-09T23:59:00.000Z") };
  const after = planCycle(extended, NOW).filter((p) => p.kind === "reminder");
  for (let i = 0; i < before.length; i++) {
    assert.equal(after[i].daysBefore, before[i].daysBefore);
    assert.equal(
      after[i].scheduledFor.getTime() - before[i].scheduledFor.getTime(),
      14 * 86_400_000,
      "each reminder should move by exactly the extension",
    );
  }
});

test("a rung already in the past is planned, and is recognisably past", () => {
  // The planner still returns it — sync.ts records it as skipped rather
  // than queueing a post nobody could ever send on time. A cycle set up
  // three days before its deadline should not put a 14-days-left draft
  // in front of a coordinator.
  const late = new Date("2026-10-23T15:00:00.000Z");
  const fourteen = planCycle(facts, late).find((p) => p.kind === "reminder" && p.daysBefore === 14);
  assert.ok(fourteen, "the 14-day rung should still be planned");
  assert.equal(isOverdue(fourteen.scheduledFor, late), true, "and it should read as past");
  const two = planCycle(facts, late).find((p) => p.kind === "reminder" && p.daysBefore === 2);
  assert.equal(isOverdue(two!.scheduledFor, late), false, "the 2-day rung is still ahead");
});

test("posts go out in a working morning, not whenever the row was made", () => {
  for (const p of planCycle(facts, NOW)) {
    const hour = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Toronto", hour: "numeric", hour12: false,
    }).format(p.scheduledFor);
    assert.ok(Number(hour) >= 8 && Number(hour) <= 10, `sent at ${hour}:00 Toronto`);
  }
});

test("day counting follows Toronto, not the server's UTC", () => {
  // 8pm Toronto on the 25th is already the 26th in UTC. A reminder that
  // says "1 day left" has to agree with the reader's calendar.
  const evening = new Date("2026-10-26T00:30:00.000Z"); // 8:30pm Oct 25 EDT
  assert.equal(daysBetween(evening, facts.deadlineAt), 1);
  assert.equal(sendTimeFor(facts.deadlineAt, 0) < facts.deadlineAt, true);
});

/* ── The words ──────────────────────────────────────────────────── */

test("the launch post carries the amount, the close date and the link", () => {
  const { body } = draftPost({ kind: "launch", facts });
  assert.match(body, /\$5,000/);
  assert.match(body, new RegExp(readableDate(facts.deadlineAt)));
  assert.match(body, /\/apply\/venture-connect/);
});

test("the closing-day reminder is a different message, not a smaller one", () => {
  const last = draftPost({ kind: "reminder", facts, daysLeft: 0 });
  const early = draftPost({ kind: "reminder", facts, daysLeft: 14 });
  assert.match(last.body, /close today/);
  assert.equal(last.asset.headline, "Closes today");
  assert.match(early.body, /14 days left/);
  assert.equal(early.asset.headline, "14 days left");
  assert.notEqual(last.body, early.body);
});

test("one day left is not '1 days left'", () => {
  assert.match(draftPost({ kind: "reminder", facts, daysLeft: 1 }).body, /\b1 day left/);
});

test("an extended deadline says so, and an unmoved one does not", () => {
  const moved = draftPost({
    kind: "reminder",
    facts: { ...facts, deadlineAt: new Date("2026-11-09T23:59:00.000Z") },
    daysLeft: 7,
  });
  assert.match(moved.body, /extended from/);
  assert.doesNotMatch(draftPost({ kind: "reminder", facts, daysLeft: 7 }).body, /extended from/);
});

/* ── Recipients, and what a post may say about a person ─────────── */

const people: Recipient[] = [
  { name: "Amara Okonkwo", venture: "PuriBio", amount: 5000 },
  { name: "Sagar Lahiri", venture: "Spectral", amount: 3200 },
];

test("a recipients post names everyone it was given and totals the awards", () => {
  const { body, asset } = draftPost({ kind: "recipients", facts, recipients: people });
  for (const p of people) assert.match(body, new RegExp(p.name));
  assert.match(body, /\$8,200 awarded across 2 ventures/);
  assert.equal(asset.names.length, 2);
});

test("amounts can be withheld without withholding the names", () => {
  const { body, asset } = draftPost({
    kind: "recipients", facts, recipients: people, showAmounts: false,
  });
  assert.match(body, /Amara Okonkwo/);
  assert.doesNotMatch(body, /\$5,000/);
  assert.doesNotMatch(body, /awarded across/);
  assert.equal(asset.subhead, "");
  for (const n of asset.names) assert.doesNotMatch(n.detail, /\$/);
});

/* ── The contract with the image renderer ───────────────────────── */

test("every draft produces an asset spec a separate agent could render", () => {
  const drafts = [
    draftPost({ kind: "launch", facts }),
    draftPost({ kind: "reminder", facts, daysLeft: 7 }),
    draftPost({ kind: "recipients", facts, recipients: people }),
  ];
  for (const d of drafts) {
    assert.equal(d.asset.version, 1);
    assert.ok(d.asset.template.startsWith("vc-"));
    assert.ok(d.asset.headline.length > 0 && d.asset.headline.length <= 60, d.asset.headline);
    assert.ok(d.asset.sizes.length > 0);
    // It must be renderable from the JSON alone — no ids, no addresses,
    // and nothing the post body does not also say.
    const json = JSON.stringify(d.asset);
    assert.doesNotMatch(json, /@/, "no email addresses in an asset spec");
    assert.doesNotMatch(json, /dl_oct|cm[0-9a-z]{20,}/, "no database ids in an asset spec");
  }
});

test("planRecipients is scheduled from now, because decisions land when they land", () => {
  const p = planRecipients(facts, NOW);
  assert.equal(p.kind, "recipients");
  assert.equal(daysBetween(NOW, p.scheduledFor), 0);
});

/* ── Regeneration: adds only, never undoes somebody's work ───────── */

import { mayRegenerate } from "../../src/lib/social/sync";

test("an untouched draft may be regenerated when the deadline moves", () => {
  const made = new Date("2026-10-01T13:00:00.000Z");
  assert.equal(mayRegenerate("draft", made, made), true);
  assert.equal(mayRegenerate("draft", null, made), true);
});

test("a draft somebody has edited is left exactly as they left it", () => {
  const made = new Date("2026-10-01T13:00:00.000Z");
  const edited = new Date("2026-10-02T09:30:00.000Z");
  assert.equal(mayRegenerate("draft", edited, made), false);
});

test("nothing past draft is ever rewritten, approved included", () => {
  const made = new Date("2026-10-01T13:00:00.000Z");
  // Approved has not gone out, but somebody read those exact words and
  // said yes to them. Rewriting under an approval is worse than a
  // superseded date the queue can flag.
  for (const status of ["approved", "scheduled", "published", "skipped"] as const) {
    assert.equal(mayRegenerate(status, made, made), false, status);
  }
});
