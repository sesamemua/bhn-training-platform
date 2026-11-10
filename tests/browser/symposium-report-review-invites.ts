import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

async function main() {
  const bundle = await build({
    stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {ReportReviewShare} from "./src/components/workspace/symposium-report/ReportReviewShare"; function App(){const [canInvite,setCanInvite]=React.useState(true); window.setCanInvite=setCanInvite; return <ReportReviewShare round={2} revision={"a".repeat(64)} canInvite={canInvite}/>}; createRoot(document.getElementById("root")).render(<App/>);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic", loader: { ".css": "empty" },
    plugins: [{ name: "report-review-actions", setup(build) {
      build.onResolve({ filter: /report\.module\.css$/ }, () => ({ path: "styles", namespace: "styles" }));
      build.onLoad({ filter: /.*/, namespace: "styles" }, () => ({ contents: "export default {};" }));
      build.onResolve({ filter: /symposium-report\/review-invites$/ }, () => ({ path: "actions", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        window.requests = [];
        export async function reportReviewRecipients() { return {recipients: [
          {id:"one",label:"Reviewer One"}, {id:"two",label:"Reviewer Two"}
        ]}; }
        export async function sendReportReviewInvites(input) {
          window.requests.push(input);
          return window.requests.length === 1 ? {sent:["one"],error:"Some invitations could not be sent."} : {sent:input.userIds};
        }
      ` }));
    } }],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.addInitScript({ content: 'window.copied=[]; Object.defineProperty(navigator,"clipboard",{value:{writeText:async function(text){if(window.denyClipboard)throw new Error("Denied");window.copied.push(text);}}});' });
    await page.route("https://report-invites.test/", route => route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' }));
    await page.route("https://report-invites.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.goto("https://report-invites.test/");
    await page.getByRole("button", { name: "Copy review link", exact: true }).click();
    await expect(page.getByRole("status")).toHaveText("Review link copied.");
    assert.deepEqual(await page.evaluate(() => (window as unknown as { copied: string[] }).copied), ["https://report-invites.test/review/symposium-2026/report"]);
    await page.evaluate(() => { (window as unknown as { denyClipboard: boolean }).denyClipboard = true; });
    await page.getByRole("button", { name: "Copy review link", exact: true }).click();
    await expect(page.getByLabel("Copy this review link")).toHaveValue("https://report-invites.test/review/symposium-2026/report");
    await page.getByRole("button", { name: "Email review request", exact: true }).click();
    await page.getByRole("checkbox", { name: "Reviewer One", exact: true }).check();
    await page.getByRole("checkbox", { name: "Reviewer Two", exact: true }).check();
    await page.evaluate(() => { (window as unknown as { setCanInvite: (value: boolean) => void }).setCanInvite(false); });
    await expect(page.getByRole("button", { name: "Send to 2", exact: true })).toBeDisabled();
    await page.evaluate(() => { (window as unknown as { setCanInvite: (value: boolean) => void }).setCanInvite(true); });
    await page.getByRole("button", { name: "Send to 2", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Reviewer One", exact: true })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Reviewer Two", exact: true })).toBeChecked();
    await page.getByRole("button", { name: "Send to 1", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send review request", exact: true })).toBeDisabled();
    assert.deepEqual(await page.evaluate(() => (window as unknown as { requests: { userIds: string[] }[] }).requests.map(x => x.userIds)), [["one", "two"], ["two"]]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("body").evaluate(node => node.scrollWidth > window.innerWidth), false);
    console.log("PASS: report link copy and fallback, saved-draft gate, per-recipient retry, mobile layout; no emails sent");
  } finally { await browser.close(); }
}

void main();
