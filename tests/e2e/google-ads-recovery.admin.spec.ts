import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { createDefaultGoogleAdsPlan } from "../../src/lib/campaign/google-ads-workspace-defaults";
import type { GoogleAdsWorkspaceState } from "../../src/lib/campaign/google-ads-workspace";

const pagePath = "/admin/workspace/marketing/google-ads";
const apiPattern = /\/api\/admin\/google-ads\/workspace(?:\?.*)?$/;
const snapshot = (): GoogleAdsWorkspaceState => ({ revision: 2, plan: createDefaultGoogleAdsPlan(), history: [], feedback: [], historyNextCursor: null });

test("inputs cannot change while a draft save is in flight", async ({ page }) => {
  const state = snapshot();
  let releaseSave = () => {};
  const saving = new Promise<void>(resolve => { releaseSave = resolve; });
  await page.route(apiPattern, async route => {
    if (route.request().method() === "PATCH") {
      const submitted = route.request().postDataJSON();
      await saving;
      await route.fulfill({ json: { ...state, revision: 3, plan: submitted.plan } });
    } else await route.fulfill({ json: state });
  });
  page.on("dialog", dialog => dialog.accept());
  await page.goto(pagePath);
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  const name = page.getByLabel("Campaign name", { exact: true });
  await name.fill("Saved campaign name");
  const request = page.waitForRequest(req => apiPattern.test(req.url()) && req.method() === "PATCH");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await request;
  try {
    await expect(name).toBeDisabled();
    await expect(page.getByLabel("Your feedback", { exact: true })).toBeDisabled();
    await expect(page.locator("#keywords").getByRole("textbox", { name: "New keywords", exact: true })).toBeDisabled();
  } finally { releaseSave(); }
  await expect(page.getByText("Saved to the training platform. Ready for Codex review.", { exact: true })).toBeVisible();
  await expect(name).toBeEnabled();
  await expect(name).toHaveValue("Saved campaign name");
});

test("unsaved input is recovered only from this viewer's session draft", async ({ page }) => {
  let state = snapshot();
  await page.route(apiPattern, route => route.fulfill({ json: state }));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(pagePath);
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Campaign name", { exact: true }).fill("My recoverable draft");
  await page.getByLabel("Your feedback", { exact: true }).fill("Keep this unsaved feedback");
  await expect.poll(() => page.evaluate(() => Object.keys(sessionStorage).filter(key => key.startsWith("bhn-google-ads-draft:")).length)).toBe(1);
  const key = await page.evaluate(() => Object.keys(sessionStorage).find(key => key.startsWith("bhn-google-ads-draft:"))!);
  await page.evaluate(key => {
    const other = JSON.parse(sessionStorage.getItem(key)!);
    other.plan.name = "Another viewer's private draft";
    sessionStorage.setItem("bhn-google-ads-draft:another-viewer", JSON.stringify(other));
  }, key);
  state = { ...state, revision: 3, plan: { ...state.plan, name: "A newer saved plan" } };
  await page.reload();
  await page.getByRole("button", { name: "Restore my draft", exact: true }).click();
  await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue("My recoverable draft");
  await expect(page.getByLabel("Your feedback", { exact: true })).toHaveValue("Keep this unsaved feedback");
  const recovered = await page.evaluate(key => JSON.parse(sessionStorage.getItem(key)!), key);
  expect(recovered.baseRevision).toBe(2);
  await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Back up edits & load latest", exact: true })).toBeEnabled();

  // A draft for a different viewer must never be offered when this viewer has none.
  await page.evaluate(key => sessionStorage.removeItem(key), key);
  await page.reload();
  await expect(page.getByRole("button", { name: "Edit plan", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Restore my draft", exact: true })).toHaveCount(0);
  await expect(page.getByText(state.plan.name, { exact: true })).toBeVisible();
});

test("a save conflict preserves the draft and offers a backup before loading latest", async ({ page }) => {
  let state = snapshot();
  await page.route(apiPattern, route => route.request().method() === "PATCH"
    ? route.fulfill({ status: 409, json: { error: "Someone else saved changes. Reload the latest plan before saving yours." } })
    : route.fulfill({ json: state }));
  page.on("dialog", dialog => dialog.accept());
  await page.goto(pagePath);
  await page.getByRole("button", { name: "Edit plan", exact: true }).click();
  await page.getByLabel("Campaign name", { exact: true }).fill("Keep my conflicting draft");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Someone else saved changes. Reload the latest plan before saving yours.", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue("Keep my conflicting draft");
  await expect(page.getByRole("button", { name: "Copy for Codex", exact: true })).toBeDisabled();
  const backupReady = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download my draft", exact: true }).click();
  const backupPath = await (await backupReady).path();
  expect(backupPath).toBeTruthy();
  const backup = JSON.parse(await readFile(backupPath!, "utf8"));
  expect(backup.baseRevision).toBe(2);
  expect(backup.plan.name).toBe("Keep my conflicting draft");

  state = { ...state, revision: 3, plan: { ...state.plan, name: "Latest saved campaign" } };
  const replacementBackup = page.waitForEvent("download");
  await page.getByRole("button", { name: "Back up edits & load latest", exact: true }).click();
  await replacementBackup;
  await expect(page.getByLabel("Campaign name", { exact: true })).toHaveValue("Latest saved campaign");
  await expect(page.getByText("Latest plan loaded. Your previous input is in the downloaded backup.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy for Codex", exact: true })).toBeEnabled();
});
