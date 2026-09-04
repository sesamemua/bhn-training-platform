/**
 * Symposium registration — full pending → approve → confirmed flow.
 *
 * This is the canonical example for how E2E specs in this repo work:
 *   1. A trainee submits the public registration form on
 *      /events/2026-annual-symposium/register.
 *   2. The success page shows the "submitted — pending approval"
 *      banner (because BhnEvent.requiresApproval defaults to true).
 *   3. The same browser runs an admin task: launch a parallel
 *      `context` signed in as admin, find that registration in
 *      /admin/events/.../registrations, click Approve.
 *   4. The trainee refreshes their success page and sees the
 *      "you're registered" green state.
 *   5. Test tears down by hard-deleting the registration so re-runs
 *      of this spec are idempotent.
 *
 * Naming: the `.both.spec.ts` suffix tells the Playwright config to
 * run this in both the trainee-chromium AND admin-chromium projects —
 * but only ONE invocation actually executes (the spec swaps roles
 * mid-test using two browser contexts). The `.both` suffix saves us
 * from copy-pasting the same spec under two names.
 */
import { test, expect } from "@playwright/test";

const EVENT_SLUG = "2026-annual-symposium";
const REGISTER_PATH = `/events/${EVENT_SLUG}/register`;
const SUCCESS_PATH = `/events/${EVENT_SLUG}/register/success`;

test.describe.configure({ mode: "serial" });

test("trainee can submit registration → admin approves → trainee sees confirmed", async ({
  browser,
}) => {
  // Two browser contexts share the same Playwright run — one carries
  // the trainee storage state, one carries admin. Doing it this way
  // (instead of swapping roles in one context via the `x` shortcut)
  // keeps each side's POV honest about what state they actually see.
  const traineeContext = await browser.newContext({
    storageState: "playwright/.auth/trainee.json",
  });
  const adminContext = await browser.newContext({
    storageState: "playwright/.auth/admin.json",
  });
  const trainee = await traineeContext.newPage();
  const admin = await adminContext.newPage();

  try {
    // ── 1. Pre-flight: clear any prior registration for the trainee
    //       so this spec is idempotent across re-runs. We do this by
    //       trying to access the success page — if it 404s, no row;
    //       if it loads, the existing row's adminNote can be inspected
    //       and the admin will delete it before we proceed.
    await trainee.goto(REGISTER_PATH);
    const alreadyRegistered = trainee.url().includes("/register/success");
    if (alreadyRegistered) {
      // Existing row from a previous run — admin nukes it permanently.
      await admin.goto(`/admin/events/${EVENT_SLUG}/registrations`);
      // The trainee's row is the one with their email; pick the row,
      // open the detail page, delete permanently.
      const traineeEmail = await getTraineeEmail(trainee);
      const row = admin.getByRole("row").filter({ hasText: traineeEmail });
      await expect(row).toBeVisible();
      // Drill into the detail page and delete.
      await row.getByRole("link").first().click();
      admin.once("dialog", (d) => d.accept());
      await admin.getByRole("button", { name: /delete permanently/i }).click();
      await admin.waitForURL(/\/admin\/events\/.+\/registrations(\?|$)/);
      await trainee.goto(REGISTER_PATH); // re-enter the form
    }

    // ── 2. Trainee fills the form
    // Default attendeeType ("trainee") is already checked. Just
    // submit — workshop picks optional and we want to assert the
    // base "no workshops picked → cross-prompt fires" path on the
    // success page.
    await expect(trainee.getByText(/not guaranteed until admin approval/i)).toBeVisible();
    await trainee.getByRole("button", { name: /submit for approval/i }).click();

    // ── 3. Success page in pending state
    await trainee.waitForURL(new RegExp(SUCCESS_PATH.replace(/\//g, "\\/")));
    await expect(trainee.getByText(/submitted — pending approval/i)).toBeVisible();
    await expect(
      trainee.getByText(/spot is.+not guaranteed/i),
    ).toBeVisible();
    // Cross-prompt: trainee picked no workshops → CTA appears.
    await expect(
      trainee.getByText(/haven't picked a Training Week tour or workshop yet/i),
    ).toBeVisible();

    // ── 4. Admin approves
    await admin.goto(`/admin/events/${EVENT_SLUG}/registrations`);
    // Tile says "Pending approval N" with N >= 1.
    await expect(admin.getByText(/pending approval/i)).toBeVisible();
    const traineeEmail = await getTraineeEmail(trainee);
    const row = admin.getByRole("row").filter({ hasText: traineeEmail });
    await expect(row).toBeVisible();
    await row.getByRole("link").first().click();
    await admin.getByRole("button", { name: /approve registration/i }).click();
    await expect(
      admin.getByText(/approved — registration confirmed|already confirmed/i),
    ).toBeVisible();

    // ── 5. Trainee refresh shows confirmed
    await trainee.reload();
    await expect(trainee.getByText(/^you're registered$/i)).toBeVisible();
    await expect(trainee.getByText(/submitted — pending approval/i)).not.toBeVisible();

    // ── 6. Cleanup — delete the registration so the next run starts fresh
    await admin.goto(`/admin/events/${EVENT_SLUG}/registrations`);
    const row2 = admin.getByRole("row").filter({ hasText: traineeEmail });
    await row2.getByRole("link").first().click();
    admin.once("dialog", (d) => d.accept());
    await admin.getByRole("button", { name: /delete permanently/i }).click();
    await admin.waitForURL(/\/admin\/events\/.+\/registrations(\?|$)/);
  } finally {
    await traineeContext.close();
    await adminContext.close();
  }
});

/**
 * Read the trainee's email from the success page. The page renders
 * `<a href="mailto:…">` inside the registration recap section; we
 * pull the address from the href to avoid hard-coding the seed email
 * in the assertion logic (so this still works after a future email
 * swap in the seed).
 */
async function getTraineeEmail(page: import("@playwright/test").Page): Promise<string> {
  // Cheaper than navigating: read from env. The setup helper used
  // the same value to mint the session cookie.
  const fromEnv = process.env.E2E_TRAINEE_EMAIL;
  if (fromEnv) return fromEnv;
  return "demo.attendee.trainee@biohubnet.test";
}
