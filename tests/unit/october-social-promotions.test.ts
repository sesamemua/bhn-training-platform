import test from "node:test";
import assert from "node:assert/strict";
import { OCTOBER_PROMOTIONS } from "../../scripts/data/october-event-promotions";
import { withSocialTags, SOCIAL_MENTIONS } from "../../src/lib/social/tags";

test("five concise event promotions use official pages, standing tags and distinct identities", () => {
  assert.equal(OCTOBER_PROMOTIONS.length, 5);
  assert.equal(new Set(OCTOBER_PROMOTIONS.map((p) => p.slug)).size, 5);
  for (const post of OCTOBER_PROMOTIONS) {
    const body = withSocialTags(post.body);
    assert.ok(body.length < 2000);
    assert.ok(body.includes(post.sourceUrl));
    assert.ok(SOCIAL_MENTIONS.every((tag) => body.includes(tag)));
    assert.equal(withSocialTags(body), body);
    assert.doesNotMatch(body, /luma\.com|\d+ seats? (left|remaining)|guaranteed seat/i);
    assert.ok(post.graphicBrief.includes("BioHubNet logo"));
  }
});

test("workshop series excludes full tours and explains concurrent sessions", () => {
  const workshops = OCTOBER_PROMOTIONS.filter((p) => p.workshopSlug);
  assert.equal(workshops.length, 4);
  assert.ok(workshops.every((p) => !/catalent|ccrm/.test(p.workshopSlug!)));
  for (const slug of ["communication-chameleon-2026", "negotiation-skills-2026"]) {
    const post = workshops.find((p) => p.workshopSlug === slug)!;
    assert.match(post.body, /rank/);
    assert.match(post.body, /same time|overlaps/);
    assert.match(post.body, /prioritized/);
  }
  assert.match(workshops.find((p) => p.workshopSlug === "innovation-showcase-2026")!.body, /do not need a second registration/);
});

test("keynote promotes the symposium instead of reproducing a biography", () => {
  const keynote = OCTOBER_PROMOTIONS.find((p) => !p.workshopSlug)!;
  assert.match(keynote.body, /@Christopher Procyshyn/);
  assert.match(keynote.body, /October 29, 2026/);
  assert.match(keynote.body, /Explore the program and register/);
  assert.doesNotMatch(keynote.body, /based in British Columbia|His work is grounded in deep experience/);
});
