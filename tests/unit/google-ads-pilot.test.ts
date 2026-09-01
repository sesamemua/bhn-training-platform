import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_ADS_CONVERSION_EVENTS,
  GOOGLE_ADS_LAUNCH_GATES,
  GOOGLE_ADS_PILOT,
  GOOGLE_ADS_PILOT_ASSETS,
  GOOGLE_ADS_PILOT_PROGRAMS,
} from "../../src/lib/campaign/google-ads-pilot";
import { CAMPAIGN_PROGRAMS } from "../../src/lib/campaign/programs";

test("pilot totals match the approved planning assets", () => {
  assert.equal(
    GOOGLE_ADS_PILOT_PROGRAMS.reduce((total, program) => total + program.monthlyBudgetCad, 0),
    GOOGLE_ADS_PILOT.monthlyBudgetCad,
  );
  assert.equal(
    GOOGLE_ADS_PILOT_PROGRAMS.reduce((total, program) => total + program.keywordCount, 0),
    51,
  );
  assert.equal(
    GOOGLE_ADS_PILOT_PROGRAMS.reduce((total, program) => total + program.negativeKeywordCount, 0),
    35,
  );
  assert.equal(
    GOOGLE_ADS_PILOT_PROGRAMS.reduce(
      (total, program) => total + program.responsiveSearchAdCount,
      0,
    ),
    9,
  );
  assert.ok(GOOGLE_ADS_PILOT_PROGRAMS.every((program) => program.status === "Paused"));
});

test("campaign routes stay aligned with the public landing and application workflows", () => {
  const byId = new Map(GOOGLE_ADS_PILOT_PROGRAMS.map((program) => [program.id, program]));

  assert.equal(byId.get("engage")?.landingPath, "/for-trainees/engage");
  assert.equal(byId.get("engage")?.applicationPath, CAMPAIGN_PROGRAMS.engage.applicationPath);
  assert.equal(byId.get("experience")?.landingPath, "/for-trainees/experience");
  assert.equal(
    byId.get("experience")?.applicationPath,
    CAMPAIGN_PROGRAMS.experience.applicationPath,
  );
  assert.equal(byId.get("venture-connect")?.landingPath, "/for-trainees/venture-connect");
  assert.equal(
    byId.get("venture-connect")?.applicationPath,
    CAMPAIGN_PROGRAMS["venture-connect"].applicationPath,
  );
});

test("only stored applications are primary conversions", () => {
  const primary = GOOGLE_ADS_CONVERSION_EVENTS.filter(
    (event) => event.classification === "Primary",
  );
  const secondary = GOOGLE_ADS_CONVERSION_EVENTS.filter(
    (event) => event.classification === "Secondary",
  );

  assert.equal(primary.length, 3);
  assert.ok(primary.every((event) => event.confirmation === "Server-confirmed"));
  assert.equal(secondary.length, 2);
  assert.equal(
    GOOGLE_ADS_CONVERSION_EVENTS.some((event) => event.name.toLowerCase().includes("page_view")),
    false,
  );
});

test("asset inventory and launch gates keep spending controls explicit", () => {
  assert.deepEqual(
    GOOGLE_ADS_PILOT_ASSETS.map((asset) => asset.count),
    [51, 35, 9, 51],
  );

  const approvals = GOOGLE_ADS_LAUNCH_GATES.filter(
    (gate) => gate.status === "approval_required",
  );
  assert.ok(approvals.some((gate) => /production/i.test(gate.title)));
  assert.ok(approvals.some((gate) => /billing and campaign activation/i.test(gate.title)));
});

test("the admin sidebar exposes the Google Ads workspace under Marketing", () => {
  const sidebar = readFileSync(join(process.cwd(), "src/components/lms/Sidebar.tsx"), "utf8");
  assert.match(sidebar, /label: "Google Ads"/);
  assert.match(sidebar, /\/admin\/workspace\/marketing\/google-ads/);
  assert.match(sidebar, /item=\{workspaceGoogleAdsItem\}/);
});
