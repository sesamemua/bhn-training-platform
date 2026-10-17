import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildSocialBrief, socialQueueItem, type SocialQueueSnapshot } from "../../src/lib/social/dashboard";
import { SocialDashboardSummary, MarketingMetrics } from "../../src/components/dashboards/MarketingMetrics";

const now = new Date("2026-10-17T16:00:00Z");
const item = { id: "p1", title: "Workshop highlight", url: "/admin/workspace/marketing/social?post=p1", at: "2026-10-16T13:00:00Z", note: "Published" };
const queue: SocialQueueSnapshot = { recent: [item], publishedCount: 1, scheduled: [{ ...item, id: "scheduled", at: "2026-10-18T13:00:00Z", note: "Scheduled" }], scheduledCount: 5, next: [{ ...item, id: "due", note: "Needs approval" }], dueCount: 3 };
const post = (at: string, reactions = 4) => ({ url: `https://www.linkedin.com/feed/update/${at}`, published: at, text: "Symposium registration", reactions, comments: 2 });

test("last 48 hours includes the exact boundary, excludes old, future and invalid dates", () => {
  const data = buildSocialBrief(queue, { followers: 2500, posts: [post("2026-10-15T16:00:00Z"), post("2026-10-17T14:00:00Z", 10),
    post("2026-10-15T15:59:59Z", 99), post("2026-10-18T12:00:00Z", 99), post("invalid", 99)] }, now);
  assert.equal(data.recent.count, 2);
  assert.equal(data.recent.reactions, 14);
  assert.equal(data.recent.comments, 4);
  assert.equal(data.recent.posts[0].at, "2026-10-17T14:00:00Z");
  assert.equal(data.recent.source, "LinkedIn");
  assert.equal(data.scheduled.count, 5);
  assert.equal(data.next.due, 3);
});

test("unavailable engagement never becomes zero or a guessed match to a draft", () => {
  for (const linkedin of [null, { followers: null, posts: null }, { followers: 2500, posts: [] }]) {
    const data = buildSocialBrief(queue, linkedin, now);
    assert.equal(data.recent.count, 1);
    assert.equal(data.recent.source, "Platform records");
    assert.equal(data.recent.reactions, null);
    assert.equal(data.recent.comments, null);
    assert.equal(data.recent.posts[0].url, item.url);
  }
  const unavailable = buildSocialBrief(null, null, now);
  assert.equal(unavailable.recent.count, null);
  assert.equal(unavailable.scheduled.count, null);
  assert.equal(unavailable.next.due, null);
  const empty = buildSocialBrief(null, { followers: 2500, posts: [] }, now);
  assert.equal(empty.recent.count, 0);
  assert.equal(empty.recent.reactions, 0);
});

test("saved suggested dates, confirmed schedules and uncertain deliveries stay distinct", () => {
  const base = { id: "post & link", body: "First line\nrest", assetSpec: {}, scheduledFor: new Date("2026-10-18T13:00:00Z"), publishedAt: null, bufferPostId: null, publishError: null };
  assert.equal(socialQueueItem({ ...base, status: "draft" }, now).note, "Needs approval");
  assert.equal(socialQueueItem({ ...base, status: "approved" }, now).note, "Ready to schedule");
  assert.equal(socialQueueItem({ ...base, status: "scheduled" }, now).note, "Needs scheduling");
  assert.equal(socialQueueItem({ ...base, status: "scheduled", bufferPostId: "buffer" }, now).note, "Scheduled");
  assert.equal(socialQueueItem({ ...base, status: "scheduled", bufferPostId: "buffer", scheduledFor: new Date("2026-10-16T13:00:00Z") }, now).note, "Check delivery");
  assert.equal(socialQueueItem({ ...base, status: "publishing" }, now).note, "Check delivery");
  const title = socialQueueItem({ ...base, status: "approved", assetSpec: { title: "AI in the Workplace" } }, now);
  assert.equal(title.title, "AI in the Workplace");
  assert.match(title.url, /post%20%26%20link/);
});

test("compact social summary has three sections, links and Toronto times, with no analytics embed", () => {
  const data = buildSocialBrief(queue, null, now);
  const html = renderToStaticMarkup(createElement(SocialDashboardSummary, { data }));
  assert.equal((html.match(/<section /g) ?? []).length, 3);
  for (const label of ["Last 48 hours", "Scheduled next", "Post next", "Needs approval", "Engagement unavailable"]) assert.ok(html.includes(label));
  assert.match(html, /Oct 18, 9:00 a\.m\./);
  assert.doesNotMatch(html, /iframe|480px|Impressions|NaN|undefined/);
  const shell = renderToStaticMarkup(createElement(MarketingMetrics));
  assert.match(shell, /Social pulse/);
  assert.match(shell, /Website analytics/);
  assert.doesNotMatch(shell, /<iframe/);
});
