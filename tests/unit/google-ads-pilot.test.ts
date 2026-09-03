import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  GOOGLE_ADS_ACTIVE_KEYWORDS,
  GOOGLE_ADS_AD_GROUP_NEGATIVES,
  GOOGLE_ADS_CAMPAIGN_NEGATIVES,
  GOOGLE_ADS_CONVERSION_EVENTS,
  GOOGLE_ADS_LAUNCH_GATES,
  GOOGLE_ADS_PILOT,
  GOOGLE_ADS_PILOT_ASSETS,
  GOOGLE_ADS_PILOT_PROGRAMS,
  GOOGLE_ADS_PROMOTION,
} from "../../src/lib/campaign/google-ads-pilot";
import { CAMPAIGN_PROGRAMS } from "../../src/lib/campaign/programs";

test("dashboard totals match the current paused Google Ads campaign", () => {
  assert.equal(GOOGLE_ADS_PILOT.monthlyBudgetCad, 600);
  assert.equal(GOOGLE_ADS_PILOT.dailyBudgetCad, 19.73);
  assert.equal(GOOGLE_ADS_PILOT.maximumCpcCad, 4);
  assert.equal(GOOGLE_ADS_PILOT.status, "Paused");
  assert.equal(GOOGLE_ADS_PILOT.spendCad, 0);
  assert.equal(
    GOOGLE_ADS_PILOT_PROGRAMS.reduce((total, program) => total + program.keywordCount, 0),
    31,
  );
  assert.equal(
    GOOGLE_ADS_CAMPAIGN_NEGATIVES.length +
      GOOGLE_ADS_PILOT_PROGRAMS.reduce((total, program) => total + program.adGroupNegativeCount, 0),
    35,
  );
  assert.equal(
    GOOGLE_ADS_PILOT_PROGRAMS.reduce(
      (total, program) => total + program.responsiveSearchAdCount,
      0,
    ),
    3,
  );
  assert.ok(GOOGLE_ADS_PILOT_PROGRAMS.every((program) => program.status === "Paused"));
});

test("active keyword lists use only phrase and exact match without BioHubNet brand terms", () => {
  const keywords = Object.values(GOOGLE_ADS_ACTIVE_KEYWORDS).flat();
  assert.equal(keywords.length, 31);
  assert.ok(keywords.every((keyword) => keyword.startsWith('"') || keyword.startsWith("[")));
  assert.ok(keywords.every((keyword) => !keyword.toLowerCase().includes("biohubnet")));
  assert.equal(Object.values(GOOGLE_ADS_AD_GROUP_NEGATIVES).flat().length, 15);
});

test("campaign negatives block common BioHubNet spelling variants", () => {
  const campaignNegatives = new Set<string>(GOOGLE_ADS_CAMPAIGN_NEGATIVES);
  for (const brandVariant of ["biohubnet", "bio hub net", "biohub net", "bio hubnet"]) {
    assert.ok(campaignNegatives.has(brandVariant));
  }
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
    [31, 35, 3, 12],
  );

  const approvals = GOOGLE_ADS_LAUNCH_GATES.filter(
    (gate) => gate.status === "approval_required",
  );
  assert.ok(approvals.some((gate) => /production conversion tracking/i.test(gate.title)));
  assert.ok(approvals.some((gate) => /campaign activation/i.test(gate.title)));
});

test("promotion is shown as redeemed but not yet earned", () => {
  assert.match(GOOGLE_ADS_PROMOTION.status, /requirements not yet complete/i);
  assert.equal(GOOGLE_ADS_PROMOTION.requirementsDueOn, "November 1, 2026");
});

test("the admin sidebar exposes the Google Ads workspace under Marketing", () => {
  const sidebar = readFileSync(join(process.cwd(), "src/components/lms/Sidebar.tsx"), "utf8");
  assert.match(sidebar, /label: "Google Ads"/);
  assert.match(sidebar, /\/admin\/workspace\/marketing\/google-ads/);
  assert.match(sidebar, /item=\{workspaceGoogleAdsItem\}/);
});
