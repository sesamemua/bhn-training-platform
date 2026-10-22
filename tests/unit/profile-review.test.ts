import test from "node:test";
import assert from "node:assert/strict";
import { profileReviewIssues } from "../../src/lib/events/profile-review";
import { PlanPersonSchema } from "../../src/lib/events/people-plan";

const profile = { fullName: "Example Person", title: "Director", organization: "Example", bio: "A public biography.", photoUrl: "https://biohubnet.ca/wp-content/uploads/photo.jpg", placements: [{ sessionId: "networking" as const, order: 0 }] };
test("clean public details pass and incomplete or suspicious wording is flagged, never rewritten", () => {
  assert.deepEqual(profileReviewIssues(profile), []);
  const bad = { ...profile, title: "Knowledge Mobilization Officert", organization: "", bio: "The the biography is TBD.", photoUrl: null };
  const before = structuredClone(bad);
  const issues = profileReviewIssues(bad);
  for (const expected of ["Organization is missing", "Headshot is missing", "Officert", "Repeated word", "placeholder"]) assert.ok(issues.some((i) => i.includes(expected)));
  assert.deepEqual(bad, before);
});
test("invalid links, concurrent placements, duplicates and wording conflicts require review", () => {
  const person = PlanPersonSchema.parse({ id: "one", fullName: profile.fullName, organization: profile.organization, source: "paste", session: "discussion", linkedSpeakerId: "s" });
  const roster = { version: null, people: [person, { ...person, id: "two", linkedSpeakerId: null }], speakers: [{ id: "s", fullName: profile.fullName, title: "Scientist", organization: "Different Org", bio: "Bio", contactEmail: null, photoUrl: null, sessionTitle: null, submittedAt: "2026-10-22T12:00:00Z" }] };
  const issues = profileReviewIssues({ ...profile, linkedinUrl: "https://linkedin.com.evil.test/profile", links: [{ label: "Company", url: "http://example.org" }], placements: [...profile.placements, { sessionId: "discussion", order: 0 }] }, { person, roster });
  for (const expected of ["linkedin.com", "Company link is invalid", "concurrent", "Another roster profile", "Title / role differs", "Organization differs", "planner assignment"]) assert.ok(issues.some((i) => i.includes(expected)), expected);
});
