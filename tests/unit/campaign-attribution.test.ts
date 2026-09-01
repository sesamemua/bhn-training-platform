import test from "node:test";
import assert from "node:assert/strict";
import {
  appendCampaignAttribution,
  campaignAttributionFromFormData,
  campaignAttributionFromSearchParams,
  campaignAuthUrl,
  parseCampaignAttribution,
  safeInternalPath,
  sanitizeCampaignAttribution,
  withCampaignAttribution,
} from "../../src/lib/campaign/attribution";

test("campaign attribution keeps only supported, bounded values", () => {
  const attribution = sanitizeCampaignAttribution({
    utm_source: " google ",
    utm_campaign: "pilot\u0000campaign",
    gclid: "click-id",
    internal_budget: "$600",
    negative_keywords: ["jobs"],
  });

  assert.deepEqual(attribution, {
    utm_source: "google",
    utm_campaign: "pilotcampaign",
    gclid: "click-id",
  });
});

test("attribution survives internal links and auth callbacks", () => {
  const attribution = { utm_source: "google", gclid: "abc123" } as const;
  const application = appendCampaignAttribution("/credits/apply?from=engage", attribution);
  assert.equal(application, "/credits/apply?from=engage&utm_source=google&gclid=abc123");

  const register = new URL(campaignAuthUrl("register", "/credits/apply", attribution), "https://example.test");
  assert.equal(register.searchParams.get("utm_source"), "google");
  assert.equal(register.searchParams.get("gclid"), "abc123");
  assert.equal(
    register.searchParams.get("callbackUrl"),
    "/credits/apply?utm_source=google&gclid=abc123",
  );
});

test("campaign callbacks reject external and protocol-relative redirects", () => {
  assert.equal(safeInternalPath("/forms/talent-application"), "/forms/talent-application");
  assert.equal(safeInternalPath("https://evil.example"), "/dashboard");
  assert.equal(safeInternalPath("//evil.example"), "/dashboard");
});

test("search, JSON and draft form attribution use one sanitizer", () => {
  const query = campaignAttributionFromSearchParams(
    new URLSearchParams("utm_medium=cpc&wbraid=wb-1&unknown=drop"),
  );
  assert.deepEqual(query, { utm_medium: "cpc", wbraid: "wb-1" });
  assert.deepEqual(parseCampaignAttribution(JSON.stringify(query)), query);

  const draft = withCampaignAttribution({ fullName: "Test Applicant" }, query);
  assert.deepEqual(campaignAttributionFromFormData(draft), query);
});
