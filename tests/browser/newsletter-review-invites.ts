import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

async function main() {
  const bundle = await build({
    stdin: { contents: 'import React from "react"; import {createRoot} from "react-dom/client"; import {NewsletterReviewInvite} from "./src/components/workspace/NewsletterReviewInvite"; createRoot(document.getElementById("root")).render(<NewsletterReviewInvite issueId="october"/>);', resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    plugins: [{ name: "review-actions", setup(build) {
      build.onResolve({ filter: /newsletter\/review-invites$/ }, () => ({ path: "actions", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: `
        window.requests = [];
        export async function newsletterReviewTeam() { return {groups: [
          {id:"editorial",label:"Yeseul, Epshita, Roshni and Ruilin",userIds:["yeseul","epshita","roshni","ruilin"],available:true},
          {id:"all",label:"Yeseul, Epshita, Roshni, Ruilin and Yoo Jin",userIds:["yeseul","epshita","roshni","ruilin","yoojin"],available:true},
          {id:"signoff",label:"Yoo Jin and Ruilin",userIds:["yoojin","ruilin"],available:true}
        ]}; }
        export async function sendNewsletterReviewInvites(input) {
          window.requests.push(input);
          return window.requests.length === 1 ? {sent:input.userIds.filter(id=>id!=="epshita"),error:"Some invitations could not be sent."} : {sent:input.userIds};
        }
      ` }));
    } }],
  });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.route("https://invites.test/", route => route.fulfill({ contentType: "text/html", body: '<html><body><div id="root"></div><script src="/app.js"></script></body></html>' }));
    await page.route("https://invites.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.goto("https://invites.test/");
    await page.getByRole("button", { name: "Send review request", exact: true }).click();
    await expect(page.getByRole("radio")).toHaveCount(3);
    await expect(page.getByRole("checkbox")).toHaveCount(0);
    await page.getByRole("button", { name: "Send to 4", exact: true }).click();
    await page.getByRole("button", { name: "Retry unsent to 1", exact: true }).click();
    await expect(page.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
    await page.getByRole("radio", { name: "Yeseul, Epshita, Roshni, Ruilin and Yoo Jin", exact: true }).check();
    await expect(page.getByRole("button", { name: "Send to 5", exact: true })).toBeEnabled();
    await page.getByRole("radio", { name: "Yoo Jin and Ruilin", exact: true }).check();
    await page.getByRole("button", { name: "Send to 2", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => (window as any).requests.map((request: any) => request.userIds)), [
      ["yeseul", "epshita", "roshni", "ruilin"], ["epshita"], ["yoojin", "ruilin"],
    ]);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await page.locator("body").evaluate(node => node.scrollWidth > window.innerWidth), false);
    console.log("PASS: exactly three recipient options, correct groups, partial-delivery retry, mobile layout; no emails sent");
  } finally { await browser.close(); }
}

void main();
