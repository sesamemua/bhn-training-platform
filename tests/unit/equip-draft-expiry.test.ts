/** Public EQUIP drafts: the two weeks, and who they apply to. */
import test from "node:test";
import assert from "node:assert/strict";
import { draftExpiresAt, draftLinkLetter, draftPath, isExpiredDraft } from "../../src/lib/equip/draft-expiry";

const told = new Date("2026-09-27T16:00:00Z");

test("two weeks from the email, not from when the draft was started", () => {
  assert.equal(draftExpiresAt(told).toISOString(), "2026-10-11T16:00:00.000Z");
});

test("a draft nobody was told about is never removed", () => {
  assert.equal(isExpiredDraft({ status: "draft", draftNoticeSentAt: null }, new Date("2030-01-01")), false);
});

test("removed only once the two weeks are up, and only while still a draft", () => {
  assert.equal(isExpiredDraft({ status: "draft", draftNoticeSentAt: told }, new Date("2026-10-11T15:59:00Z")), false);
  assert.equal(isExpiredDraft({ status: "draft", draftNoticeSentAt: told }, new Date("2026-10-11T16:00:00Z")), true);
  // Submitted in time: never touched, however long ago the notice was.
  for (const status of ["submitted", "under_review", "info_requested", "approved"]) {
    assert.equal(isExpiredDraft({ status, draftNoticeSentAt: told }, new Date("2030-01-01")), false, status);
  }
});

test("each stream's link goes to its own page", () => {
  assert.equal(draftPath("venture_connect", "abc"), "/apply/venture-connect/abc");
  assert.equal(draftPath("innovation_fellowship", "abc"), "/apply/innovation-fellowship/abc");
});

test("the letter carries the link, the date and what happens after it", () => {
  const { subject, text } = draftLinkLetter({
    name: "Ana Diaz", stream: "venture_connect", link: "https://x/apply/venture-connect/abc", expiresAt: draftExpiresAt(told),
  });
  assert.match(subject, /VentureConnect/);
  assert.match(text, /^Hello Ana,/);
  assert.ok(text.includes("https://x/apply/venture-connect/abc"));
  assert.match(text, /Sunday, October 11|Sunday 11 October/);
  assert.match(text, /removed/);
});
