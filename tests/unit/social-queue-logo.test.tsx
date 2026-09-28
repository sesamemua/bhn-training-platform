import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";

const post: QueuePost = {
  id: "post-1",
  stream: "symposium_2026",
  kind: "speaker",
  status: "draft",
  cycleLabel: "Alex Chen",
  daysBefore: 0,
  body: "Meet @Alex Chen.",
  editVersion: 0,
  trackChanges: true,
  assetUrl: "/api/admin/social/posts/post-1/image",
  organization: "Example Labs",
  companyLogoUrl: null,
  assetSpec: {},
  scheduledFor: "2026-09-27T12:00:00.000Z",
  overdue: false,
  stale: false,
};

test("a missing logo keeps the picture and actions available", () => {
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [post] }));
  assert.match(html, /Alex Chen/);
  assert.match(html, /Upload organization logo/);
  assert.match(html, /alt="Social graphic for Alex Chen"/);
  assert.match(html, /max-w-\[555px\]/);
  assert.match(html, /Download graphic/);
  assert.doesNotMatch(html, /disabled=""[^>]*>.*Approve/);
});

test("a speaker post with a logo displays the graphic and permits approval", () => {
  const html = renderToStaticMarkup(createElement(SocialQueue, {
    initial: [{ ...post, companyLogoUrl: "https://brand.r2.dev/example.png" }],
  }));
  assert.match(html, /alt="Social graphic for Alex Chen"/);
  assert.match(html, /alt="Example Labs logo"/);
  assert.match(html, /Download graphic/);
});
