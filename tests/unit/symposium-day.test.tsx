import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SYMPOSIUM_DAY_AGENDA, SYMPOSIUM_DAY_POSTS, SYMPOSIUM_DAY_PREFIX } from "../../src/lib/social/symposium-day";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

test("the day-of drafts cover the published agenda in Toronto time, including both concurrent sessions", () => {
  assert.equal(SYMPOSIUM_DAY_POSTS.length, 17);
  assert.equal(new Set(SYMPOSIUM_DAY_POSTS.map(p => p.key)).size, 17);
  assert.equal(SYMPOSIUM_DAY_POSTS[0].scheduledFor.toISOString(), "2026-10-29T12:30:00.000Z");
  assert.equal(SYMPOSIUM_DAY_POSTS.at(-1)!.scheduledFor.toISOString(), "2026-10-29T20:50:00.000Z");
  for (const post of SYMPOSIUM_DAY_POSTS) {
    assert.ok(post.key.startsWith(SYMPOSIUM_DAY_PREFIX));
    assert.ok(post.body.includes("@BioHubNet"));
    assert.ok(post.body.length < 6000);
    assert.ok(!("approvedAt" in post));
  }
  assert.equal(SYMPOSIUM_DAY_AGENDA.filter(p => p.time === "15:30").length, 2);
});

test("the separate day-of tab reuses inline editing, ordering, review, photo upload and guarded deletion", () => {
  const source = SYMPOSIUM_DAY_POSTS[0];
  const post: QueuePost = { ...source, id: "day-1", symposiumDay: true, campaignSlug: "day-1", cycleLabel: source.assetSpec.title,
    status: "draft", daysBefore: 0, editVersion: 0, trackChanges: true, assetUrl: null, organization: null, companyLogoUrl: null,
    scheduledFor: source.scheduledFor.toISOString(), overdue: false, stale: false };
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [post, { ...post, id: "other", symposiumDay: false, body: "unrelated event" }], initialGroup: "symposium_day", initialDayOrder: { order: [post.id], version: null } }));
  for (const label of ["Symposium Day", "New post", "Post text for Breakfast", "Move Breakfast and Registration up", "Delete post", "Upload graphic", "Review"]) assert.ok(html.includes(label), label);
  assert.ok(!html.includes("unrelated event"));
});
