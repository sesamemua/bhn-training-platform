import test from "node:test";
import assert from "node:assert/strict";
import { INSTITUTIONS, VENTURE_LIFT_INSTITUTIONS } from "../../src/lib/equip/institutions";
import { checkCampaignInstitution } from "../../src/lib/campaign/eligibility";
import type { CampaignProgram } from "../../src/lib/campaign/events";

const PILOT_DATE = new Date("2026-09-01T12:00:00.000Z");
const PROGRAMS: CampaignProgram[] = ["engage", "experience", "venture_connect"];

test("all 41 published institutions pass the pilot institution check", () => {
  assert.equal(INSTITUTIONS.length, 41);
  assert.equal(VENTURE_LIFT_INSTITUTIONS.length, 14);

  for (const program of PROGRAMS) {
    for (const institution of INSTITUTIONS) {
      const result = checkCampaignInstitution(program, institution.slug, PILOT_DATE);
      assert.equal(result.eligible, true, `${program}: ${institution.name}`);
      assert.equal(result.access, institution.tier === "current" ? "full" : "limited");
    }
  }
});

test("limited access stops self-confirming after the published January 2027 window", () => {
  const result = checkCampaignInstitution(
    "venture_connect",
    "mcgill-university",
    new Date("2027-02-02T12:00:00.000Z"),
  );
  assert.equal(result.eligible, false);
  assert.equal(result.reason, "published_window_ended");
  assert.equal(result.access, "limited");
});

test("unknown institutions require manual confirmation", () => {
  const result = checkCampaignInstitution("engage", "not-on-the-list", PILOT_DATE);
  assert.deepEqual(result, {
    eligible: false,
    reason: "not_listed",
    institution: null,
    access: "none",
  });
});
