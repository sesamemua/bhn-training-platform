import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { sourcePublicProfile, PublicProfilePreview } from "../../src/components/admin/events/PeoplePublicationPanel";
import type { PlanPerson, PlanSnapshot } from "../../src/lib/events/people-plan";
const p: PlanPerson = { id: "p", fullName: "Example Person", organization: "Example", title: "Director", bio: "CONFIDENTIAL PLANNING NOTE", email: "private@example.org", session: "discussion", source: "paste", linkedSpeakerId: null, ignoredSpeakerIds: [], archived: false };
const roster: PlanSnapshot = { version: null, people: [p], speakers: [] };
test("publication prefills never copy private planning notes, contact email or automatic session assignments", () => {
  const profile = sourcePublicProfile(p, roster);
  assert.equal(profile.bio, "");
  assert.deepEqual(profile.placements, []);
  assert.ok(!JSON.stringify(profile).includes("private@example.org"));
  assert.ok(!JSON.stringify(profile).includes("CONFIDENTIAL"));
});
test("publication previews escape biography HTML and render approved links separately", () => {
  const profile = { ...sourcePublicProfile(p, roster), bio: "<script>alert('unsafe')</script>", links: [{ label: "Company", url: "https://example.org/" }] };
  const html = renderToStaticMarkup(<PublicProfilePreview profile={profile} />);
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes('href="https://example.org/"'));
  assert.ok(!html.includes("private@example.org"));
});
