import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { SYMPOSIUM_CAMPAIGN_PLAN } from "../../src/lib/social/symposium-campaign";
import { withSocialTags, SOCIAL_MENTIONS } from "../../src/lib/social/tags";
import { CRS_EVENT_POST } from "../../src/lib/social/events";
import { SocialQueue, type QueuePost } from "../../src/components/workspace/SocialQueue";
import { DEFAULT_SOCIAL_ORDER } from "../../src/lib/social/order";
import { SYMPOSIUM_PANEL_POSTS } from "../../src/lib/social/symposium-panel-posts";

test("campaign covers every weekday through the symposium, without individual speaker spotlights except Chris", () => {
  const dates = [...new Set(SYMPOSIUM_CAMPAIGN_PLAN.map((post) => post.suggestedDate.slice(0, 10)))].sort();
  assert.deepEqual(dates, ["2026-10-14", "2026-10-15", "2026-10-16", "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
  assert.equal(new Set(SYMPOSIUM_CAMPAIGN_PLAN.map((post) => post.slug)).size, 15);
  for (const post of SYMPOSIUM_CAMPAIGN_PLAN) {
    const body = withSocialTags(post.body);
    assert.ok(body.length < 2000);
    assert.ok(body.includes(post.sourceUrl));
    assert.ok(SOCIAL_MENTIONS.every((tag) => body.includes(tag)));
    assert.doesNotMatch(body, /luma\.com|\d+ seats? (left|remaining)|guaranteed seat/i);
    assert.ok(post.graphicBrief.includes("BioHubNet logo"));
  }
  assert.equal(SYMPOSIUM_CAMPAIGN_PLAN.filter((post) => /Keynote:/.test(post.title)).length, 1);
  assert.match(SYMPOSIUM_CAMPAIGN_PLAN[0].title, /Christopher Procyshyn/);
});

test("each event day has a real-photo brief with permission and a factual review requirement", () => {
  const photos = SYMPOSIUM_CAMPAIGN_PLAN.filter((post) => post.photoBrief);
  assert.deepEqual(photos.map((post) => post.suggestedDate.slice(0, 10)), ["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29"]);
  for (const post of photos) {
    assert.match(post.graphicBrief, /Real /);
    assert.match(post.photoBrief!, /permission|consent/);
    assert.match(post.photoBrief!, /confidential|badge|attendee/);
    assert.ok(!post.workshopSlug, "event-day coverage must not depend on seats still being available");
  }
  assert.match(photos[0].photoBrief!, /high-containment/);
  assert.match(photos[1].photoBrief!, /CCRM host clearance/);
});

test("the career slot highlights the complete Panel 2 without creating extra speaker posts", () => {
  const panel = SYMPOSIUM_CAMPAIGN_PLAN.find((post) => post.slug === "symposium-2026-careers-connections-oct22")!;
  assert.match(panel.title, /Panel 2: Expanding Career Horizons/);
  assert.equal(panel.suggestedDate, "2026-10-22T13:00:00Z");
  for (const name of ["Angela Davoud", "Jasmine Hamilton", "Sven Ansorge"]) {
    assert.ok(panel.body.includes(`@${name}`));
    assert.ok(panel.graphicBrief.includes(name));
  }
  assert.match(panel.body, /1:30-2:15 p\.m\. ET/);
  assert.match(panel.body, /register:/);
  assert.doesNotMatch(panel.body, /Dimitrije Jankovic|Yannick Dupe/);
  assert.ok(panel.body.length < 1100, "promote attendance, not full biographies");
});

const example: QueuePost = {
  id: "campaign-1", stream: "events", kind: "event", status: "draft", cycleLabel: "Day 1 in pictures",
  daysBefore: 0, body: "Photo caption draft.", editVersion: 0, trackChanges: true,
  assetUrl: null, organization: null, companyLogoUrl: null, assetSpec: {},
  scheduledFor: "2026-10-26T20:30:00Z", overdue: false, stale: false,
  campaign: true, requiresPhoto: true, visualBrief: "Capture a consent-cleared workshop photo.",
  publicationNote: "Hold until real photos are uploaded and the pictured activity is confirmed.",
};

test("calendar groups campaign posts separately from other events and keeps posted history", () => {
  const other = { ...example, id: "other", campaign: false, cycleLabel: "Other event", body: "Unrelated sponsor post." };
  const published = { ...example, id: "published", status: "published", cycleLabel: "Already posted", body: "Published caption", assetUrl: "https://images.example/live.png" };
  const skipped = { ...example, id: "skipped", status: "skipped", cycleLabel: "Declined post", body: "Declined caption" };
  const html = renderToStaticMarkup(createElement(SocialQueue, { initial: [example, other, published, skipped] }));
  assert.match(html, /Weekday campaign plan through the symposium/);
  assert.doesNotMatch(html, /4:30 p\.m\.|Oct 26/, "planned dates are left blank");
  assert.match(html, /aria-label="No scheduled date"/);
  assert.match(html, /Awaiting event photos/);
  assert.match(html, /Already posted/);
  assert.match(html, /href="\/admin\/workspace\/marketing\/social\?post=campaign-1"/);
  assert.match(html, /Post text for Day 1 in pictures/);
  assert.match(html, /Upload graphic for Day 1 in pictures/);
  assert.match(html, /Image &amp; publication brief/);
  assert.doesNotMatch(html, /Published caption|Declined caption|Unrelated sponsor post/);
  const review = renderToStaticMarkup(createElement(SocialQueue, { initial: [example], reviewMode: true }));
  assert.match(review, /tab=symposium_2026/);
  assert.match(review, /Capture a consent-cleared workshop photo/);
  const events = renderToStaticMarkup(createElement(SocialQueue, { initial: [example, other], initialGroup: "events" }));
  assert.match(events, /Unrelated sponsor post/);
  assert.doesNotMatch(events, /Photo caption draft/);
  const scheduled = renderToStaticMarkup(createElement(SocialQueue, { initial: [{ ...example, status: "scheduled", bufferPostId: "buffer-confirmed" }] }));
  assert.match(scheduled, /dateTime="2026-10-26T20:30:00Z"/);
  assert.match(scheduled, /Oct 26, 2026/);
  assert.doesNotMatch(scheduled, /Dates are left blank/);
});

test("page creates missing drafts once, preserves edits and graphics, and no longer generates speaker posts", async () => {
  const source = readFileSync("src/app/(dashboard)/admin/workspace/marketing/social/page.tsx", "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const require = createRequire(import.meta.url);
  const existingKey = `events:event:${SYMPOSIUM_CAMPAIGN_PLAN[0].slug}:0`;
  const existing = { id: "chris", key: existingKey, body: "A colleague's edited keynote post", assetUrl: "https://images.example/chris.png" as string | null, status: "approved", stream: "events", kind: "event", deadlineId: SYMPOSIUM_CAMPAIGN_PLAN[0].slug, assetSpec: { title: "Keynote" }, scheduledFor: new Date(SYMPOSIUM_CAMPAIGN_PLAN[0].suggestedDate), updatedAt: new Date(), approvedAt: null, approvedBy: null, editVersion: 4 };
  const saved = new Map<string, typeof existing>([[existingKey, existing]]);
  let authorized = true;
  let creations = 0;
  let lastWhere: unknown;
  const mocks: Record<string, unknown> = {
    "next/navigation": { redirect: () => { throw new Error("redirect"); }, notFound: () => { throw new Error("not found"); } },
    "@/lib/auth": { requireRole: async () => { if (!authorized) throw new Error("unauthorized"); return { user: { id: "admin" } }; } },
    "@/lib/prisma": { prisma: { socialPost: {
      createMany: async ({ data, skipDuplicates }: { data: Array<Omit<typeof existing, "status">>; skipDuplicates: boolean }) => {
        assert.equal(skipDuplicates, true);
        for (const post of data) {
          assert.equal(post.kind, "event");
          assert.ok(!("status" in post), "new posts use the draft database default");
          if (!saved.has(post.key)) { saved.set(post.key, { ...existing, ...post, id: post.key, status: "draft", assetUrl: null }); creations++; }
        }
      },
      findMany: async ({ where }: { where: unknown }) => { lastWhere = where; return [...saved.values()]; },
    }, bhnEvent: { findUnique: async () => null }, designArtwork: { findMany: async () => [] } } },
    "@/components/ui/PageHero": { PageHero: () => null },
    "@/components/workspace/FullWidthWhenCollapsed": { FullWidthWhenCollapsed: () => null },
    "@/components/workspace/SocialQueue": { SocialQueue },
    "@/lib/social/cycles": { openCycles: async () => [] },
    "@/lib/allocation/symposium-2026": { EVENT_SLUG: "2026-annual-symposium" },
    "@/lib/social/company-logo": { logoOverride: () => null },
    "@/lib/social/speakers": { SYMPOSIUM_SOCIAL_STREAM: "symposium_2026", syncSpeakerHighlights: () => { throw new Error("speaker drafts must not regenerate"); } },
    "@/lib/social/events": { CRS_EVENT_POST },
    "@/lib/social/symposium-campaign": { SYMPOSIUM_CAMPAIGN_PLAN },
    "@/lib/social/tags": { withSocialTags },
    "@/lib/social/order-store": { loadSocialOrder: async () => ({ order: DEFAULT_SOCIAL_ORDER, version: null }) },
  };
  const exports: { default?: (props: unknown) => Promise<React.ReactNode> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const render = (params = {}) => exports.default!({ searchParams: Promise.resolve(params) });
  authorized = false;
  await assert.rejects(render, /redirect/);
  assert.equal(creations, 0);
  authorized = true;
  const html = renderToStaticMarkup(await render());
  assert.ok(html.includes(SYMPOSIUM_CAMPAIGN_PLAN[0].title), "known campaign titles must update without overwriting saved drafts");
  assert.match(html, /A colleague&#x27;s edited keynote post/);
  assert.match(html, /src="https:\/\/images.example\/chris.png"/);
  assert.match(html, /Awaiting event photos/);
  assert.equal(creations, 15);
  await render();
  assert.equal(creations, 15, "revisiting must not duplicate or overwrite drafts");
  assert.equal(saved.get(existingKey), existing);
  for (const post of SYMPOSIUM_CAMPAIGN_PLAN.slice(1, 8)) {
    saved.get(`events:event:${post.slug}:0`)!.assetUrl = "https://images.example/campaign.png";
  }
  const series = renderToStaticMarkup(await render({ series: "symposium_2026" }));
  assert.deepEqual(lastWhere, { key: { in: SYMPOSIUM_CAMPAIGN_PLAN.map((post) => `events:event:${post.slug}:0`) } });
  assert.match(series, /A colleague&#x27;s edited keynote post/);
  assert.match(series, /Approve selected \(7\)/);
  assert.doesNotMatch(series, /<table|role="tablist"/);
  await assert.rejects(render({ series: "unsupported" }), /not found/);
  await assert.rejects(render({ series: "symposium_2026", post: "chris" }), /not found/);
});

test("fresh panel drafts include titles and original photos in one row without inventing Yannick's photo", () => {
  assert.equal(SYMPOSIUM_PANEL_POSTS.length, 3);
  const [ai, careers, manufacturing] = SYMPOSIUM_PANEL_POSTS;
  for (const line of ["@Morgan Cramm, Senior Director Operations, OmniaBio", "@Dimitrije Jankovic, Global Head of Digital Strategy and Operations, Sanofi", "@Mona Abu Nameh, CMC Regulatory Affairs Manager", "@Alice Feng, Computational Scientist and HQP Representative, BoutIQ Solutions"]) assert.ok(ai.body.includes(line));
  assert.match(careers.body, /@Angela Davoud, Co-founder & Chief Growth Officer, PeakR&D/);
  assert.match(careers.body, /@Jasmine Hamilton, Senior Advisor, Health Emergency Readiness Canada/);
  assert.match(careers.body, /@Sven Ansorge, Director, Technical Training and Innovation, CASTL/);
  assert.match(ai.assetUrl!, /^https:\/\/pub-.*\.r2\.dev\/social\/events\//);
  assert.match(careers.assetUrl!, /^https:\/\/pub-.*\.r2\.dev\/social\/events\//);
  assert.match(manufacturing.body, /Moderated by @Gilbert Walker, Professor, University of Toronto/);
  assert.match(manufacturing.body, /@Geoff Evans, President, Eurofins CDMO Alphora Inc\./);
  assert.match(manufacturing.body, /former CEO, Vanrx Pharmasystems/);
  assert.match(manufacturing.body, /@Yannick Dupe, Head of Site Operational Excellence & Smart Factory, Sanofi/);
  for (const panel of SYMPOSIUM_PANEL_POSTS) {
    assert.match(panel.assetUrl, /^https:\/\/pub-.*\.r2\.dev\/social\/events\//);
    assert.match(panel.graphicBrief, /one horizontal row/);
    assert.match(panel.graphicBrief, /professional title and organization/);
    assert.match(panel.graphicBrief, /no retouching or color changes/);
    assert.match(panel.graphicBrief, /Moderator .* above the panelists/);
  }
  assert.match(manufacturing.graphicBrief, /official Sanofi company logo in Yannick's headshot position, never initials or an invented portrait/);
  assert.match(manufacturing.body, /2:15-3:00 p\.m\. ET/);
});
