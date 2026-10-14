import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { approveSeries, canApproveInSeries, SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

const ready: QueuePost = {
  id: "ready", campaign: true, stream: "events", kind: "event", status: "draft",
  cycleLabel: "Keynote", daysBefore: 0, body: "Opening paragraph.\n\nFull middle paragraph.\n\nLast paragraph of the complete post.",
  editVersion: 3, trackChanges: true, assetUrl: "https://images.example/keynote.png",
  organization: null, companyLogoUrl: null, assetSpec: {}, scheduledFor: "2026-10-14T13:00:00Z", overdue: false, stale: false,
};

test("series review shows complete posts and graphics together, not a table of review links", () => {
  const photos = { ...ready, id: "photos", cycleLabel: "Day 1", body: "Complete event-day caption.", assetUrl: null, requiresPhoto: true };
  const approved = { ...ready, id: "approved", cycleLabel: "Already reviewed", status: "approved", body: "Approved caption.", approvedByName: "Yoo Jin", approvedAt: "2026-10-14T14:00:00Z" };
  const unrelated = { ...ready, id: "other", campaign: false, body: "Unrelated post" };
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [ready, photos, approved, unrelated], seriesReview: true }));
  assert.match(html, /Full middle paragraph/);
  assert.match(html, /Last paragraph of the complete post/);
  assert.match(html, /Complete event-day caption/);
  assert.match(html, /src="https:\/\/images.example\/keynote.png"/);
  assert.match(html, /3 posts · 1 ready for approval/);
  assert.match(html, /Approve selected \(1\)/);
  assert.match(html, /Select Keynote for approval"[^>]*checked/);
  assert.match(html, /Select Day 1 for approval"[^>]*disabled/);
  assert.match(html, /Awaiting event photos/);
  assert.match(html, /Approved by Yoo Jin/);
  assert.doesNotMatch(html, /<table|role="tablist"|Unrelated post|\?post=/);
});

test("only draft campaign posts with a graphic and no stale warning are ready", () => {
  assert.equal(canApproveInSeries(ready), true);
  for (const changes of [{ campaign: false }, { status: "approved" }, { status: "published" }, { status: "skipped" }, { assetUrl: null }, { stale: true }]) {
    assert.equal(canApproveInSeries({ ...ready, ...changes }), false);
  }
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [{ ...ready, assetUrl: null, requiresPhoto: true }], seriesReview: true }));
  assert.match(html, /disabled=""[^>]*>[^<]*<svg[^]*?Approve selected \(0\)/);
});

test("series approval reuses each single-post approval and stops on a conflict", async () => {
  const posts = [ready, { ...ready, id: "held", assetUrl: null }, { ...ready, id: "second" }, { ...ready, id: "conflict" }, { ...ready, id: "later" }];
  const calls: string[] = [];
  const approved = await approveSeries(posts, async (id) => { calls.push(id); return id !== "conflict"; });
  assert.equal(approved, 2);
  assert.deepEqual(calls, ["ready", "second", "conflict"]);
  calls.length = 0;
  assert.equal(await approveSeries(posts, async (id) => { calls.push(id); return true; }), 4);
  assert.deepEqual(calls, ["ready", "second", "conflict", "later"]);
});

test("each campaign post review offers the full-series link", () => {
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [ready], reviewMode: true }));
  assert.match(html, /href="\/admin\/workspace\/marketing\/social\?series=symposium_2026"/);
  assert.match(html, /Review full series/);
  assert.match(html, /Last paragraph of the complete post/);
});
