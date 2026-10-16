import assert from "node:assert/strict";
import test from "node:test";
import { coordinatorInfoFor } from "../../src/lib/training-week/coordinator-info";

const audit = {
  detail: JSON.stringify({ email: "person@utoronto.ca", workshopId: "ignited", sourceName: "Person Name", institute: "University of Toronto", position: "Master's student", company: "Venture", participation: "Pitch/poster", emailSource: "Eligibility list" }),
  createdAt: new Date("2026-10-16T22:05:23Z"), actor: { name: "Ruilin Yuan" },
};

test("shows supplied company and participation for an exact email and event match", () => {
  const info = coordinatorInfoFor([audit], "PERSON@UTORONTO.CA", ["other", "ignited"]);
  assert.equal(info?.company, "Venture");
  assert.equal(info?.participation, "Pitch/poster");
  assert.equal(info?.recordedBy, "Ruilin Yuan");
  assert.equal(info?.recordedAt, "2026-10-16T22:05:23.000Z");
});

test("does not attach another person's information or a different event", () => {
  assert.equal(coordinatorInfoFor([audit], "other@utoronto.ca", ["ignited"]), undefined);
  assert.equal(coordinatorInfoFor([audit], "person@utoronto.ca", ["other"]), undefined);
  assert.equal(coordinatorInfoFor([audit], "", ["ignited"]), undefined);
});

test("ignores malformed imports and unresolved addresses without exposing raw audit data", () => {
  const bad = ["bad json", "null", JSON.stringify({ email: "not verified" })].map((detail) => ({ ...audit, detail }));
  assert.equal(coordinatorInfoFor(bad, "person@utoronto.ca", ["ignited"]), undefined);
  assert.equal(coordinatorInfoFor([...bad, audit], "person@utoronto.ca", ["ignited"])?.name, "Person Name");
});

test("no-email registrations match only their exact submission and workshop, never another blank email", () => {
  const noEmail = { ...audit, detail: JSON.stringify({ ...JSON.parse(audit.detail), email: null, submissionId: "named-guest" }) };
  assert.equal(coordinatorInfoFor([noEmail], "", ["ignited"], "named-guest")?.company, "Venture");
  assert.equal(coordinatorInfoFor([noEmail], "", ["ignited"], "another-guest"), undefined);
  assert.equal(coordinatorInfoFor([noEmail], "", ["other"], "named-guest"), undefined);
  assert.equal(coordinatorInfoFor([noEmail], "", ["ignited"]), undefined);
});
