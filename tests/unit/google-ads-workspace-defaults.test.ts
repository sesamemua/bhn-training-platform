import test from "node:test";
import assert from "node:assert/strict";
import { createDefaultGoogleAdsPlan } from "../../src/lib/campaign/google-ads-workspace-defaults";
import { getGoogleAdsPlanWarnings, googleAdsPlanSchema } from "../../src/lib/campaign/google-ads-workspace";

test("draft keeps the approved three programs, budget and scoped exclusions", () => {
  const plan = googleAdsPlanSchema.parse(createDefaultGoogleAdsPlan());
  assert.deepEqual(plan.programs.map(program => program.id), ["engage", "experience", "venture-connect"]);
  assert.equal(plan.settings.monthlyBudgetCad, 600);
  assert.equal(plan.settings.language, "English");
  assert.doesNotMatch(JSON.stringify(plan), /venturelift|\$25[,.]?000|\$25k/i);
  const campaignTerms = new Set(plan.campaignNegatives.map(term => term.text.toLowerCase()));
  for (const variant of ["biohubnet", "bio hub net", "biohub net", "bio hubnet"]) assert.ok(campaignTerms.has(variant));
  for (const useful of ["jobs", "internship", "student", "free", "funded", "nursing", "medical school"]) assert.ok(!campaignTerms.has(useful));
  assert.ok(plan.campaignNegatives.length > 50);
  assert.deepEqual(getGoogleAdsPlanWarnings(plan), []);
});

test("institution-specific ads respect Google Ads limits and VentureConnect's travel offer", () => {
  const plan = createDefaultGoogleAdsPlan();
  for (const program of plan.programs) {
    assert.ok(program.ads.some(ad => /toronto/i.test(ad.institution)));
    assert.ok(program.ads.some(ad => /mcgill/i.test(ad.institution)));
    for (const ad of program.ads) {
      assert.ok(ad.headlines.length >= 3 && ad.headlines.length <= 15);
      assert.ok(ad.descriptions.length >= 2 && ad.descriptions.length <= 4);
      assert.ok(ad.headlines.every(line => Array.from(line).length <= 30));
      assert.ok(ad.descriptions.every(line => Array.from(line).length <= 90));
    }
  }
  const founder = plan.programs.find(program => program.id === "venture-connect")!;
  assert.match(JSON.stringify(founder.ads), /travel/i);
  assert.match(JSON.stringify(founder.ads), /5,000|5K/i);
});
