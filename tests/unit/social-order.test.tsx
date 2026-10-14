import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DEFAULT_SOCIAL_ORDER, SocialOrderSchema, moveSocialPost, sortSocialPosts } from "../../src/lib/social/order";
import { SYMPOSIUM_CAMPAIGN_PLAN } from "../../src/lib/social/symposium-campaign";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

const posts: QueuePost[] = SYMPOSIUM_CAMPAIGN_PLAN.map((post) => ({
  id: post.slug, campaignSlug: post.slug, campaign: true, stream: "events", kind: "event", status: "draft",
  cycleLabel: post.title, body: post.body, daysBefore: 0, editVersion: 0, trackChanges: true, assetUrl: null,
  organization: null, companyLogoUrl: null, assetSpec: {}, scheduledFor: post.suggestedDate, overdue: false, stale: false,
}));

test("default order follows the symposium agenda first, then Training Week days, not posting dates", () => {
  assert.equal(SocialOrderSchema.safeParse(DEFAULT_SOCIAL_ORDER).success, true);
  const sorted = sortSocialPosts(posts, DEFAULT_SOCIAL_ORDER);
  assert.deepEqual(sorted.map((post) => post.campaignSlug), DEFAULT_SOCIAL_ORDER);
  assert.match(sorted[0].cycleLabel, /Keynote/);
  assert.match(sorted[1].cycleLabel, /AI/);
  assert.match(sorted[2].cycleLabel, /Panel 2/);
  assert.ok(sorted.slice(0, 4).every((post) => post.cycleLabel.startsWith("2026 Symposium")));
  assert.ok(sorted.slice(4).every((post) => post.cycleLabel.startsWith("Training Week")));
  assert.deepEqual(posts.map((post) => post.scheduledFor), SYMPOSIUM_CAMPAIGN_PLAN.map((post) => post.suggestedDate));
});

test("manual moves persist a complete permutation, skip hidden posts and cannot cross list boundaries", () => {
  const [keynote, panel1, panel2] = DEFAULT_SOCIAL_ORDER;
  const visible = DEFAULT_SOCIAL_ORDER.filter((slug) => slug !== keynote);
  assert.deepEqual(moveSocialPost(DEFAULT_SOCIAL_ORDER, panel1, -1, visible), DEFAULT_SOCIAL_ORDER);
  const moved = moveSocialPost(DEFAULT_SOCIAL_ORDER, panel2, -1, visible);
  assert.deepEqual(moved.slice(0, 3), [keynote, panel2, panel1]);
  assert.equal(SocialOrderSchema.safeParse(moved).success, true);
  assert.deepEqual(moveSocialPost(moved, panel2, 1, visible), DEFAULT_SOCIAL_ORDER);
  assert.deepEqual(moveSocialPost(DEFAULT_SOCIAL_ORDER, "missing", 1), DEFAULT_SOCIAL_ORDER);
  assert.deepEqual(moveSocialPost(DEFAULT_SOCIAL_ORDER, DEFAULT_SOCIAL_ORDER.at(-1)!, 1), DEFAULT_SOCIAL_ORDER);
  for (const invalid of [[], DEFAULT_SOCIAL_ORDER.slice(1), [...DEFAULT_SOCIAL_ORDER.slice(1), panel1], [...DEFAULT_SOCIAL_ORDER.slice(1), "outside-campaign"]]) {
    assert.equal(SocialOrderSchema.safeParse(invalid).success, false);
  }
});

test("table, full cards and series review use the same shared order with accessible arrow controls", () => {
  const order = moveSocialPost(DEFAULT_SOCIAL_ORDER, DEFAULT_SOCIAL_ORDER[2], -1);
  for (const seriesReview of [false, true]) {
    const html = renderToStaticMarkup(createElement(SocialQueue, { initial: posts, initialOrder: { order, version: null }, seriesReview }));
    assert.ok(html.indexOf('Post text for 2026 Symposium | Panel 2') < html.indexOf('Post text for 2026 Symposium | AI'));
    assert.match(html, /aria-label="Move 2026 Symposium \| Panel 2: Expanding Career Horizons up"/);
    assert.match(html, /title="Move down"/);
    assert.match(html, /aria-label="Move 2026 Symposium \| Keynote: Christopher Procyshyn up"[^>]*disabled/);
  }
  const unavailable = renderToStaticMarkup(createElement(SocialQueue, { initial: posts, initialOrder: null }));
  assert.match(unavailable, /Shared post order is unavailable/);
  assert.match(unavailable, /aria-label="Move 2026 Symposium \| Panel 2: Expanding Career Horizons up"[^>]*disabled/);
  const single = renderToStaticMarkup(createElement(SocialQueue, { initial: [posts[0]], reviewMode: true }));
  assert.doesNotMatch(single, /aria-label="Move /);
});
