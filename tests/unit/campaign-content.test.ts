import test from "node:test";
import assert from "node:assert/strict";
import {
  activePublishedDeadline,
  CAMPAIGN_PROGRAMS,
} from "../../src/lib/campaign/programs";
import { CAMPAIGN_EVENT_NAMES } from "../../src/lib/campaign/events";

test("campaign routes point to the existing application workflows", () => {
  assert.equal(CAMPAIGN_PROGRAMS.engage.applicationPath, "/credits/apply");
  assert.equal(CAMPAIGN_PROGRAMS.experience.applicationPath, "/forms/talent-application");
  assert.equal(CAMPAIGN_PROGRAMS["venture-connect"].applicationPath, "/apply/venture-connect");
});

test("public copy includes required limits and partner roles", () => {
  const engage = JSON.stringify(CAMPAIGN_PROGRAMS.engage);
  const experience = JSON.stringify(CAMPAIGN_PROGRAMS.experience);
  const ventureConnect = JSON.stringify(CAMPAIGN_PROGRAMS["venture-connect"]);

  assert.match(engage, /up to \$5,000 CAD/i);
  assert.match(engage, /CASTL/);
  assert.match(engage, /BioTalent Canada/);
  assert.match(engage, /BioHubNet is the funding, curation and access layer/i);

  assert.match(experience, /paid industry placement/i);
  assert.match(experience, /does not guarantee an interview, employer match, placement or job/i);

  assert.match(ventureConnect, /up to \$5,000 CAD/i);
  assert.match(ventureConnect, /Meals are not covered/i);
  assert.match(ventureConnect, /not for general operating expenses or company salaries/i);
});

test("trainee-facing campaign data does not contain internal media-planning details", () => {
  const publicCopy = JSON.stringify(CAMPAIGN_PROGRAMS).toLowerCase();
  for (const forbidden of [
    "average cpc",
    "monthly budget",
    "negative keyword",
    "auction insights",
    "competitor strategy",
  ]) {
    assert.equal(publicCopy.includes(forbidden), false, forbidden);
  }
});

test("the verified VentureConnect deadline disappears after it passes", () => {
  const ventureConnect = CAMPAIGN_PROGRAMS["venture-connect"];
  assert.equal(
    activePublishedDeadline(ventureConnect, new Date("2026-09-01T12:00:00.000Z"))?.label,
    "September 24, 2026 at noon ET",
  );
  assert.equal(
    activePublishedDeadline(ventureConnect, new Date("2026-09-25T12:00:00.000Z")),
    null,
  );
});

test("conversion event names distinguish engagement from confirmed applications", () => {
  assert.equal(CAMPAIGN_EVENT_NAMES.ctaClick, "campaign_cta_click");
  assert.equal(CAMPAIGN_EVENT_NAMES.eligibilityComplete, "campaign_eligibility_complete");
  assert.match(CAMPAIGN_EVENT_NAMES.engageApplicationSubmitted, /submitted$/);
  assert.match(CAMPAIGN_EVENT_NAMES.experienceApplicationSubmitted, /submitted$/);
  assert.match(CAMPAIGN_EVENT_NAMES.ventureConnectApplicationSubmitted, /submitted$/);
  assert.equal(new Set(Object.values(CAMPAIGN_EVENT_NAMES)).size, 5);
});
