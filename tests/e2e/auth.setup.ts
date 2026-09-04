/**
 * Auth setup — runs ONCE before the rest of the suite and saves a
 * NextAuth session cookie to disk per role.
 *
 * Why two storage files: most flows are exercised either as a
 * trainee (registration, workshop booking) or as an admin (approval,
 * deletion, audit). Sharing one cookie across both would force every
 * spec to do role-switching via the `x` shortcut just to land in the
 * right view — slow and fragile. Two files cost ~100 ms once and let
 * each spec start in the right role.
 *
 * The cookies come from POST /api/test/e2e-sign-in (gated by
 * E2E_AUTH_SECRET + non-production VERCEL_ENV). See that route for
 * the full security argument.
 *
 * Pre-condition: the admin account must exist on the target DB (hard
 * failure otherwise). The trainee account is best-effort — if
 * `demo.attendee.trainee@biohubnet.test` (seeded by
 * `npx tsx prisma/seed-events.ts`) or `E2E_TRAINEE_EMAIL` isn't found,
 * trainee.json is simply not written and a warning is logged; specs
 * that need a trainee-authenticated view without a real seeded account
 * can act-as via POST /api/admin/act-as under the admin session instead.
 */
import { test as setup, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const AUTH_DIR = path.join(process.cwd(), "playwright", ".auth");

setup.beforeAll(() => {
  fs.mkdirSync(AUTH_DIR, { recursive: true });
});

setup("authenticate as trainee", async ({ request }) => {
  const email = process.env.E2E_TRAINEE_EMAIL ?? "demo.attendee.trainee@biohubnet.test";
  const res = await mintSession(request, email);
  if (res.status() === 404) {
    // No seeded/real trainee account exists on this deployment's DB — not
    // fatal. Specs needing a trainee-authenticated view (e.g. the a11y
    // audit) fall back to POST /api/admin/act-as under the admin session
    // instead, so a missing trainee.json only breaks a *trainee*-project
    // spec that genuinely needs a real trainee login (none currently do).
    console.warn(
      `[auth.setup] no trainee account for ${email} on this DB (404) — ` +
        `skipping trainee.json. Set E2E_TRAINEE_EMAIL to a real trainee, ` +
        `seed one, or use act-as for trainee-view specs.`,
    );
    return;
  }
  expect(
    res.ok(),
    `E2E sign-in failed for ${email} — status ${res.status()}. ` +
      `Make sure E2E_AUTH_SECRET is set on the target deployment and ` +
      `matches the value in this runner's env.`,
  ).toBeTruthy();
  await persistStorageState(request, "trainee");
});

setup("authenticate as admin", async ({ request }) => {
  const email = process.env.E2E_ADMIN_EMAIL;
  if (!email) {
    throw new Error(
      "E2E_ADMIN_EMAIL is not set. The admin spec needs a real admin " +
        "account on the preview DB — point this env var at one with role=admin " +
        "or role=superadmin.",
    );
  }
  const res = await mintSession(request, email);
  expect(
    res.ok(),
    `E2E sign-in failed for ${email} — status ${res.status()}. ` +
      `Make sure E2E_AUTH_SECRET is set on the target deployment and ` +
      `matches the value in this runner's env.`,
  ).toBeTruthy();
  await persistStorageState(request, "admin");
});

/**
 * POST to the gated auth-bypass route. Callers decide how to react to a
 * non-OK response — the trainee test treats 404 (account doesn't exist
 * on this DB) as a soft skip; the admin test always hard-fails, since a
 * missing admin account is a genuine setup problem, not an expected gap.
 */
async function mintSession(
  request: import("@playwright/test").APIRequestContext,
  email: string,
) {
  return request.post("/api/test/e2e-sign-in", {
    headers: process.env.E2E_AUTH_SECRET
      ? { "x-e2e-secret": process.env.E2E_AUTH_SECRET }
      : undefined,
    data: { email },
  });
}

/**
 * Persist a deterministic signed-in browser state. API request contexts
 * capture cookies but cannot discover browser localStorage, so add the
 * same necessary-only consent decision a user can make in the banner.
 * Dismissing onboarding through the real API prevents first-run dialogs
 * from intercepting clicks in unrelated flow and accessibility tests.
 */
async function persistStorageState(
  request: import("@playwright/test").APIRequestContext,
  role: "trainee" | "admin",
) {
  const onboarding = await request.patch("/api/onboarding", {
    data: { dismissed: true, minimized: false },
  });
  expect(
    onboarding.ok(),
    `Could not dismiss onboarding for the ${role} E2E session — status ${onboarding.status()}.`,
  ).toBeTruthy();

  const outPath = path.join(AUTH_DIR, `${role}.json`);
  const state = await request.storageState();
  const origin = new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3001").origin;
  const consent = JSON.stringify({
    necessary: true,
    analytics: false,
    marketing: false,
    version: "1.0",
    acceptedAt: new Date().toISOString(),
  });

  fs.writeFileSync(
    outPath,
    JSON.stringify({
      ...state,
      origins: [
        ...state.origins.filter((entry) => entry.origin !== origin),
        { origin, localStorage: [{ name: "bhn-consent", value: consent }] },
      ],
    }),
  );
}
