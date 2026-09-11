/**
 * VentureConnect — the public application front door.
 *
 *   /apply/venture-connect            name + email, then "Start"
 *   /apply/venture-connect/<token>    the application itself
 *
 * SAFE TO POINT AT PRODUCTION, and that is the design constraint.
 *
 * `POST /api/public/equip/start` creates a real draft EquipApplication and
 * is rate-limited GLOBALLY (60 anonymous starts an hour). A spec that
 * really started applications would pollute the EQUIP tracker and, run a
 * few times, could lock genuine applicants out for an hour. So every call
 * to the public EQUIP API is intercepted in the browser: the start is
 * answered by a stub, and anything else under /api/public/equip is
 * aborted. Nothing here writes a row.
 *
 * What this cannot cover: the application form itself. That page is a
 * server component that reads the application straight from Prisma by
 * token, so its first render happens before the browser can intercept
 * anything — a made-up token 404s, and a real one means a real row. The
 * form needs its own run against a throwaway database.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

const APPLY = "/apply/venture-connect";
/** 32 chars, the length the real 24-byte base64url token has, so the
 *  token page gets past its length guard and does the lookup. */
const STUB_TOKEN = "e2eStubToken0000000000000000000A";
const UTM = "utm_source=google&utm_medium=cpc&utm_campaign=vc-e2e&gclid=e2e-click";

/**
 * Stub the start endpoint and abort every other public EQUIP call, so a
 * mistake in this file can never reach the database. Returns the bodies
 * the page actually sent, for assertions.
 */
async function guardEquipApi(
  page: Page,
  start: (route: Route) => Promise<void>,
): Promise<{ bodies: Record<string, unknown>[] }> {
  const sent = { bodies: [] as Record<string, unknown>[] };
  await page.route("**/api/public/equip/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/public/equip/start" && route.request().method() === "POST") {
      sent.bodies.push(route.request().postDataJSON() as Record<string, unknown>);
      return start(route);
    }
    return route.abort("blockedbyclient");
  });
  return sent;
}

/**
 * Open the apply page and clear the consent banner the way a careful
 * visitor would, with the most private choice.
 *
 * Not a test convenience: on a first visit the banner is pinned over the
 * bottom of the viewport, and on this page that is exactly where the
 * Start button is. At 1280x720 it covers the button, the note under it
 * and half of both inputs, and the page is too short to scroll them
 * clear — so a real applicant has to dismiss it first, too.
 */
async function openApply(page: Page, query = ""): Promise<void> {
  await page.goto(query ? `${APPLY}?${query}` : APPLY);
  const banner = page.getByRole("region", { name: "We respect your privacy" });
  await banner.waitFor({ state: "visible", timeout: 5_000 }).catch(() => {});
  if (await banner.isVisible()) {
    await banner.getByRole("button", { name: "Necessary only" }).click();
    await expect(banner).toBeHidden();
  }
}

const fieldName = (page: Page) => page.getByLabel("Your full name");
const fieldEmail = (page: Page) => page.getByLabel("Email", { exact: true });
const startButton = (page: Page) => page.getByRole("button", { name: /Start the application/ });

test("the apply page renders, is accessible, and fits the viewport", async ({ page }) => {
  const res = await page.goto(APPLY);
  expect(res?.status()).toBe(200);

  await expect(page.getByRole("heading", { level: 1, name: "VentureConnect application" })).toBeVisible();
  await expect(page.getByText("$5,000 CAD", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Who can apply" })).toBeVisible();
  await expect(fieldName(page)).toBeVisible();
  await expect(fieldEmail(page)).toBeVisible();

  const { clientWidth, scrollWidth } = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(scrollWidth, "no horizontal scroll").toBeLessThanOrEqual(clientWidth);

  const a11y = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(a11y.violations).toEqual([]);
});

test("Start stays disabled until there is a real name and an email", async ({ page }) => {
  await openApply(page);
  const button = startButton(page);

  await expect(button).toBeDisabled();

  await fieldName(page).fill("A");                 // one character is not a name
  await fieldEmail(page).fill("founder@example.com");
  await expect(button).toBeDisabled();

  await fieldName(page).fill("Ada Founder");
  await expect(button).toBeEnabled();

  await fieldEmail(page).fill("   ");              // whitespace is not an address
  await expect(button).toBeDisabled();
});

test("Start sends the applicant to the start endpoint and opens their application, keeping the campaign", async ({ page }) => {
  const sent = await guardEquipApi(page, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, token: STUB_TOKEN }),
    }),
  );

  await openApply(page, UTM);
  await fieldName(page).fill("Ada Founder");
  await fieldEmail(page).fill("founder@example.com");
  await startButton(page).click();

  // Lands on the application's own link — which, for a stub token, the
  // server correctly does not recognise. The URL is the assertion.
  await page.waitForURL((u) => u.pathname === `${APPLY}/${STUB_TOKEN}`);

  expect(sent.bodies).toHaveLength(1);
  const body = sent.bodies[0];
  expect(body.name).toBe("Ada Founder");
  expect(body.email).toBe("founder@example.com");
  expect(body.stream, "a VentureConnect link must never start an Innovation Fellowship").toBe("venture_connect");
  expect(body.campaignAttribution).toMatchObject({
    utm_source: "google",
    utm_medium: "cpc",
    utm_campaign: "vc-e2e",
    gclid: "e2e-click",
  });

  // The attribution rides along to the application link too, so the form
  // can stamp it on the submission.
  const landed = new URL(page.url());
  expect(landed.searchParams.get("utm_campaign")).toBe("vc-e2e");
  expect(landed.searchParams.get("gclid")).toBe("e2e-click");
});

test("a refused start shows the server's reason and stays on the page", async ({ page }) => {
  const reason =
    "That address has opened several applications today. Use the link from the first one, or write to equip@biohubnet.ca.";
  await guardEquipApi(page, (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ error: reason }) }),
  );

  await openApply(page);
  await fieldName(page).fill("Ada Founder");
  await fieldEmail(page).fill("founder@example.com");
  await startButton(page).click();

  await expect(page.getByText(reason)).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(APPLY);
  await expect(startButton(page), "the applicant can try again").toBeEnabled();
});

test("a start that cannot reach the server says so instead of hanging", async ({ page }) => {
  await guardEquipApi(page, (route) => route.abort("connectionfailed"));

  await openApply(page);
  await fieldName(page).fill("Ada Founder");
  await fieldEmail(page).fill("founder@example.com");
  await startButton(page).click();

  await expect(page.getByText("Couldn't reach the server. Try again in a moment.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(APPLY);
  await expect(startButton(page)).toBeEnabled();
});

test("a start response without a token is treated as a failure, not a navigation", async ({ page }) => {
  await guardEquipApi(page, (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) }),
  );

  await openApply(page);
  await fieldName(page).fill("Ada Founder");
  await fieldEmail(page).fill("founder@example.com");
  await startButton(page).click();

  await expect(page.getByText("Couldn't start the application.")).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(APPLY);
});

test("an application link nobody issued is a 404, not an empty form", async ({ page }) => {
  // Read-only: the server looks the token up and finds nothing.
  const res = await page.goto(`${APPLY}/${STUB_TOKEN}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "VentureConnect application" })).toHaveCount(0);
});

test("a link too short to be a real token is rejected before any lookup", async ({ page }) => {
  const res = await page.goto(`${APPLY}/short`);
  expect(res?.status()).toBe(404);
});
