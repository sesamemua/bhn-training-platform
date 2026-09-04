import { test, expect } from "@playwright/test";

const pagePath = "/admin/workspace/marketing/google-ads";
const apiPath = "/api/admin/google-ads/workspace";

test("campaign edits persist, feedback is recorded and handoff includes changes", async ({ page, request, baseURL }) => {
  const host = new URL(baseURL || "http://localhost:3001").hostname;
  test.skip(host === "bhn-training-platform.vercel.app" || host === "app.biohubnet.ca", "Synthetic saves are restricted to Preview/local testing.");
  const tag = `editor qa ${Date.now()}`;
  await page.goto(pagePath);
  await expect(page.getByRole("heading", { name: "Google Ads", exact: true })).toBeVisible();
  await test.info().attach("Google Ads desktop", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  const keywords = page.locator("#keywords");
  await keywords.getByRole("textbox", { name: "New keywords", exact: true }).fill(tag);
  await keywords.getByRole("button", { name: "Add keywords", exact: true }).click();
  await expect(page.getByText("Unsaved changes", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved to the training platform. Ready for Codex review.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.locator("#keywords").getByText(tag, { exact: true })).toBeVisible();

  // Remove only this test's term; do not restore a whole snapshot over another editor's work.
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByRole("button", { name: `Remove ${tag}`, exact: true }).click();
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Saved to the training platform. Ready for Codex review.", { exact: true })).toBeVisible();

  await page.getByLabel("Your feedback", { exact: true }).fill(`Synthetic Preview check: ${tag}`);
  await page.getByRole("button", { name: "Save feedback", exact: true }).click();
  await expect(page.getByText("Feedback saved and included in the Codex handoff.", { exact: true })).toBeVisible();
  const feedback = page.locator("#feedback article").filter({ hasText: `Synthetic Preview check: ${tag}` });
  await feedback.getByRole("button", { name: "Mark reviewed", exact: true }).click();
  await expect(feedback.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText(`Synthetic Preview check: ${tag}`, { exact: true }).first()).toBeVisible();

  const handoff = await request.get(`${apiPath}?format=handoff`);
  expect(handoff.ok()).toBeTruthy();
  const content = await handoff.text();
  expect(content).toContain(tag);
  expect(content).toContain("proposedPlan");
  expect(content).toContain("changeHistory");
  expect(content).toContain("feedback-resolved");
  expect(content).toContain("not a live Google Ads update");
});

test("campaign editor works at mobile width and keeps negative text readable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(pagePath);
  await expect(page.getByRole("heading", { name: "Google Ads", exact: true })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  expect(overflow).toBeFalsy();
  await test.info().attach("Google Ads mobile", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByRole("link", { name: "Negatives", exact: true }).click();
  const brand = page.locator("#negatives article").filter({ has: page.getByText("biohubnet", { exact: true }) }).first();
  await expect(brand).toBeVisible();
  const textStyle = await brand.locator("strong").evaluate(el => ({ fontSize: getComputedStyle(el).fontSize, decoration: getComputedStyle(el).textDecorationLine }));
  expect(parseFloat(textStyle.fontSize)).toBeGreaterThanOrEqual(16);
  expect(textStyle.decoration).not.toContain("line-through");
});
