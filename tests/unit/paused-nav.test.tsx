/**
 * Where ENGAGE + EXPERIENCE are paused, the Sidebar and the onboarding
 * tour must not offer a way into them — and where nothing is paused
 * (local, bhn-demo) they must be exactly what they were.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { Sidebar } from "../../src/components/lms/Sidebar";
import { PreferencesSwitchboard } from "../../src/components/profile/PreferencesSwitchboard";
import { TOUR_STEPS } from "../../src/lib/onboarding/tours";
import { FEATURES, FEATURE_HREF, isFeaturePaused } from "../../src/lib/preferences/registry";
import { CAMPAIGN_PROGRAMS, getCampaignProgram, liveCampaignSlugs } from "../../src/lib/campaign/programs";
import { campaignAuthUrl } from "../../src/lib/campaign/attribution";
import { isPausedPath, withoutPausedSteps } from "../../src/lib/deploy/paused";
import { pausedApiPrefixesEnvValue, pausedPagePrefixesEnvValue } from "../../deploy/paused-routes.mjs";

function withPaused(on: boolean, fn: () => void) {
  const keys = ["NEXT_PUBLIC_PAUSED_PREFIXES", "NEXT_PUBLIC_PAUSED_API_PREFIXES"] as const;
  const prev = keys.map((k) => process.env[k]);
  process.env.NEXT_PUBLIC_PAUSED_PREFIXES = on ? pausedPagePrefixesEnvValue() : "";
  process.env.NEXT_PUBLIC_PAUSED_API_PREFIXES = on ? pausedApiPrefixesEnvValue() : "";
  try {
    fn();
  } finally {
    keys.forEach((k, i) => {
      if (prev[i] === undefined) delete process.env[k];
      else process.env[k] = prev[i];
    });
  }
}

const noop = () => {};
// Cast, not annotated: the instance type gains required fields between
// Next minors (16.3 added bfcacheId), and `next build` type-checks tests —
// a mock that must list every field breaks the deploy on the next upgrade.
const router = {
  back: noop,
  forward: noop,
  refresh: noop,
  push: noop,
  replace: noop,
  prefetch: noop,
} as unknown as AppRouterInstance;

function renderSidebar(role: string, committees: string[] = []): { html: string; hrefs: string[] } {
  const html = renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <PathnameContext.Provider value="/dashboard">
        <Sidebar
          role={role}
          realRole={role}
          actingAs={null}
          user={{ name: "Test", email: "test@example.com" }}
          credits={0}
          committees={committees}
        />
      </PathnameContext.Provider>
    </AppRouterContext.Provider>,
  );
  const hrefs = [...new Set([...html.matchAll(/href="([^"#][^"]*)"/g)].map((m) => m[1]))];
  return { html, hrefs };
}

test("with nothing paused the sidebar still offers ENGAGE, EXPERIENCE and the employer portal", () => {
  withPaused(false, () => {
    const admin = renderSidebar("superadmin", ["hqp"]);
    for (const href of ["/courses", "/internships", "/employer/postings", "/admin/enrollments", "/admin/employer-invites", "/buddy"]) {
      assert.ok(admin.hrefs.includes(href), `superadmin sees ${href}`);
    }
    assert.match(admin.html, />EXPERIENCE</);
    assert.match(admin.html, /HR PREVIEW/);

    const employer = renderSidebar("employer");
    assert.match(employer.html, /EMPLOYER PORTAL/);
    assert.ok(employer.hrefs.includes("/employer/postings"));

    const trainee = renderSidebar("trainee", ["hqp"]);
    assert.ok(trainee.hrefs.includes("/committee/hqp"));
    assert.ok(trainee.hrefs.includes("/forms/talent-application"));
  });
});

test("with the pillars paused no sidebar link leads into them", () => {
  withPaused(true, () => {
    for (const [role, committees] of [
      ["superadmin", ["hqp", "equip_review"]],
      ["admin", []],
      ["instructor", []],
      ["trainee", ["hqp"]],
      ["evaluating", []],
      ["employer", []],
    ] as const) {
      const { html, hrefs } = renderSidebar(role, [...committees]);
      const leaks = hrefs.filter((h) => isPausedPath(h));
      assert.deepEqual(leaks, [], `${role} sidebar links into a paused pillar`);
      assert.doesNotMatch(html, />EXPERIENCE</, `${role}: empty EXPERIENCE section is dropped`);
      assert.doesNotMatch(html, /EMPLOYER PORTAL|HR PREVIEW/, `${role}: employer sections are dropped`);
    }

    const admin = renderSidebar("superadmin");
    for (const href of ["/dashboard", "/events", "/equip", "/admin/equip", "/admin/committees/equip-review", "/admin/workspace", "/admin/experience-metrics", "/admin/users", "/changelog"]) {
      assert.ok(admin.hrefs.includes(href), `superadmin still sees ${href}`);
    }
    assert.match(admin.html, />ENGAGE</, "ENGAGE keeps its section for Events");

    const trainee = renderSidebar("trainee");
    for (const href of ["/dashboard", "/events", "/equip", "/changelog"]) {
      assert.ok(trainee.hrefs.includes(href), `trainee still sees ${href}`);
    }
  });
});

test("the onboarding tour drops paused steps only where something is paused", () => {
  const NOTE = "deploy.engage-experience-paused";
  withPaused(false, () => {
    const kept = withoutPausedSteps(TOUR_STEPS);
    assert.deepEqual(
      TOUR_STEPS.filter((s) => !kept.includes(s)).map((s) => s.id),
      [NOTE],
      "only the pause note is left out where nothing is paused",
    );
    const plain = TOUR_STEPS.filter((s) => s.id !== NOTE);
    assert.equal(kept.length, plain.length);
    kept.forEach((step, i) => assert.equal(step, plain[i], "steps are untouched, in order"));
    assert.equal(withoutPausedSteps(plain), plain, "same array back when no step is pause-only");
  });
  withPaused(true, () => {
    const kept = withoutPausedSteps(TOUR_STEPS);
    const keptIds = new Set(kept.map((s) => s.id));
    assert.ok(kept.length < TOUR_STEPS.length, "some steps pointed into ENGAGE / EXPERIENCE");
    assert.ok(kept.length > 0);
    for (const step of kept) {
      assert.equal(isPausedPath(step.path), false, `${step.id} lives on a paused page`);
      assert.equal(isPausedPath(step.cta?.href), false, `${step.id} links to a paused page`);
      assert.ok(!step.pausedPillar, `${step.id} describes a paused feature`);
    }
    for (const step of TOUR_STEPS.filter((s) => !keptIds.has(s.id))) {
      assert.ok(
        step.pausedPillar || isPausedPath(step.path) || isPausedPath(step.cta?.href),
        `${step.id} was dropped for no reason`,
      );
    }
    for (const id of ["adaptive-mvp", "skill-gap-widget", "applicant-kanban", "trainee.engage-credit-application-callout"]) {
      assert.ok(!keptIds.has(id), `${id} is dropped`);
    }
    const home = kept.find((s) => s.id === "trainee.dashboard");
    assert.ok(home, "the dashboard intro stays");
    assert.doesNotMatch(home.body, /credit|catalog|pathway/i, "with the paused wording");
    assert.ok(keptIds.has(NOTE), "the pause note shows");
    assert.ok(keptIds.has("workspace.merch.store"), "unrelated steps stay");
  });
});

test("the feature switcher hides toggles for paused features only", () => {
  // FEATURE_HREF must match the Sidebar's NavItems.
  const sidebarSrc = fs.readFileSync(path.join(__dirname, "../../src/components/lms/Sidebar.tsx"), "utf8");
  const pairs = [...sidebarSrc.matchAll(/href:\s*"([^"]+)"[^{}]*?featureId:\s*"([^"]+)"/g)];
  assert.ok(pairs.length >= 25, `found ${pairs.length} sidebar features`);
  for (const [, href, id] of pairs) assert.equal(FEATURE_HREF[id], href, `FEATURE_HREF["${id}"]`);
  for (const id of Object.keys(FEATURE_HREF)) {
    assert.ok(FEATURES.some((f) => f.id === id), `${id} is a registered feature`);
  }

  const render = () =>
    renderToStaticMarkup(<PreferencesSwitchboard initialPrefs={{ hidden: [], order: [] }} />);
  withPaused(false, () => {
    assert.equal(FEATURES.filter((f) => isFeaturePaused(f.id)).length, 0);
    const html = render();
    for (const f of FEATURES) assert.ok(html.includes(`>${f.label.replace(/&/g, "&amp;")}<`), `shows ${f.label}`);
    assert.match(html, new RegExp(`Affects ${FEATURES.length} features today`));
  });
  withPaused(true, () => {
    const paused = FEATURES.filter((f) => isFeaturePaused(f.id));
    assert.equal(paused.length, 26, paused.map((f) => f.id).join(", "));
    const html = render();
    for (const f of paused) assert.ok(!html.includes(`>${f.label}<`), `hides ${f.label}`);
    for (const label of ["Dashboard", "Events", "Changelog", "EQUIP · Funding", "My profile"]) {
      assert.ok(html.includes(`>${label.replace(/&/g, "&amp;")}<`), `still shows ${label}`);
    }
    assert.match(html, new RegExp(`Affects ${FEATURES.length - paused.length} features today`));
    assert.ok(html.includes(">Equip me<"), "an Experience toggle with no paused page stays");
  });
});

test("campaign pages for paused programs are gone, and their sign-up buttons with them", () => {
  withPaused(false, () => {
    assert.deepEqual(liveCampaignSlugs(), Object.keys(CAMPAIGN_PROGRAMS));
    for (const slug of Object.keys(CAMPAIGN_PROGRAMS)) {
      assert.equal(getCampaignProgram(slug), CAMPAIGN_PROGRAMS[slug as keyof typeof CAMPAIGN_PROGRAMS]);
    }
    assert.match(campaignAuthUrl("register", "/credits/apply", {}), /callbackUrl=%2Fcredits%2Fapply/);
  });
  withPaused(true, () => {
    assert.deepEqual(liveCampaignSlugs(), ["venture-connect"]);
    assert.equal(getCampaignProgram("engage"), null);
    assert.equal(getCampaignProgram("experience"), null);
    assert.equal(getCampaignProgram("venture-connect"), CAMPAIGN_PROGRAMS["venture-connect"]);
  });
  for (const junk of ["", "toString", "constructor", "nope"]) assert.equal(getCampaignProgram(junk), null, junk);
});

test("the tour step announcing the pause is covered by the current tour version", async () => {
  const { TOUR_VERSION } = await import("../../src/lib/onboarding/tours");
  const step = TOUR_STEPS.find((s) => s.id === "deploy.engage-experience-paused");
  assert.ok(step);
  // The version string sorts by date; TOUR_VERSION must have been bumped
  // to at least this step's release.
  assert.equal(step.since, "2026.10.12a");
  assert.ok(TOUR_VERSION >= step.since, `TOUR_VERSION ${TOUR_VERSION} is older than ${step.since}`);
  assert.equal(TOUR_STEPS.filter((s) => s.id === step.id).length, 1, "the step id is unique");
});
