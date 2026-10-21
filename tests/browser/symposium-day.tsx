import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium, expect } from "@playwright/test";
import { SYMPOSIUM_DAY_POSTS } from "../../src/lib/social/symposium-day";
import type { QueuePost } from "../../src/components/workspace/SocialQueue";

async function main() {
  let posts: QueuePost[] = SYMPOSIUM_DAY_POSTS.slice(0, 2).map((p, i) => ({ ...p, id: `day-${i}`, symposiumDay: true, campaignSlug: `day-${i}`,
    cycleLabel: p.assetSpec.title, status: "draft", daysBefore: 0, editVersion: 0, trackChanges: true, assetUrl: null,
    organization: null, companyLogoUrl: null, scheduledFor: p.scheduledFor.toISOString(), overdue: false, stale: false }));
  let layout = { order: posts.map(p => p.id), version: null as string | null }, savedEmail = "", emailWrites = 0, publications = 0;
  const snapshot = () => ({ posts: posts.filter(p => p.status !== "skipped"), layout: { ...layout, order: layout.order.filter(id => posts.some(p => p.id === id && p.status !== "skipped")) } });
  const css = await postcss([tailwind()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `import React,{useState} from 'react';import {createRoot} from 'react-dom/client';import {SocialQueue} from './src/components/workspace/SocialQueue';import {RegistrantEmailEditor} from './src/components/workspace/RegistrantEmailEditor';const data=JSON.parse(document.getElementById('fixture').textContent);function App(){const[saved,setSaved]=useState(false);return <><div className="mb-5">{saved?'Email recorded':<RegistrantEmailEditor id="registration-1" name="Test Attendee" onSaved={()=>setSaved(true)}/>}</div><SocialQueue initial={data.posts} initialGroup="symposium_day" initialDayOrder={data.layout}/></>};createRoot(document.getElementById('root')).render(<App/>);` },
    plugins: [{ name: "server-action-fixture", setup(build) {
      build.onResolve({ filter: /training-admin\/email-actions$/ }, () => ({ path: "email-action", namespace: "fixture" }));
      build.onResolve({ filter: /^@\/lib\/(social\/graphic-review|design-review\/actions)$/ }, () => ({ path: "review-actions", namespace: "fixture" }));
      build.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({ contents: path === "email-action"
        ? `export async function addRegistrantEmail(id,email){return (await fetch('/fixture-email',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,email})})).json();}`
        : `export const reviewSocialGraphic=()=>{throw Error('Not used in this fixture')};export const addDesignPin=reviewSocialGraphic,deleteDesignPin=reviewSocialGraphic,editDesignPin=reviewSocialGraphic,lockDesignRound=reviewSocialGraphic,markDesignSeen=reviewSocialGraphic,replyDesignPin=reviewSocialGraphic,requestDesignReview=reviewSocialGraphic,resolveDesignPin=reviewSocialGraphic,setDesignApproval=reviewSocialGraphic,setDesignOk=reviewSocialGraphic,startDesignRound=reviewSocialGraphic;` }));
    } }],
    bundle: true, write: false, jsx: "automatic", format: "iife", define: { "process.env": "{}" } });
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
    await page.route("https://social.test/", route => route.fulfill({ contentType: "text/html", body: `<html lang="en"><head><title>Symposium day</title><style>${css.css}:root{--fg:#172022;--muted:#526063;--subtle:#526063;--line:#d6dddf;--brand:#176353;--brand-600:#176353;--brand-700:#135045;--card-solid:white;--elevated:#eef3f2}body{margin:0}main{padding:16px}</style></head><body><main><div id="root"></div></main><script id="fixture" type="application/json">${JSON.stringify(snapshot()).replace(/</g, "\\u003c")}</script><script src="/app.js"></script></body></html>` }));
    await page.route("https://social.test/app.js", route => route.fulfill({ contentType: "application/javascript", body: bundle.outputFiles[0].text }));
    await page.route("https://social.test/api/admin/social/publish", route => { if (route.request().method() === "POST") publications++; return route.fulfill({ json: { ready: false } }); });
    await page.route("https://social.test/fixture-email", route => { const input = route.request().postDataJSON(); assert.equal(input.id, "registration-1"); savedEmail = input.email; emailWrites++; return route.fulfill({ json: { ok: true } }); });
    await page.route("https://social.test/api/admin/social/posts", route => {
      const input = route.request().postDataJSON(), post = posts.find(p => p.id === input.id)!;
      assert.equal(input.expectedVersion, post.editVersion);
      if (input.action === "edit") { post.body = input.body; post.trackChanges = input.trackChanges; post.editVersion++; }
      else { assert.equal(input.action, "skip"); post.status = "skipped"; }
      return route.fulfill({ json: { ok: true, post } });
    });
    await page.route("https://social.test/api/admin/social/day", route => {
      const input = route.request().postDataJSON();
      if (input.action === "order") { assert.equal(input.version, layout.version); layout = { order: input.order, version: "2026-10-21T23:00:00.000Z" }; return route.fulfill({ json: { layout } }); }
      assert.equal(input.action, "create"); assert.match(input.requestId, /^[\da-f-]{36}$/);
      const post = { ...posts[0], id: "manual", campaignSlug: "manual", cycleLabel: input.title, body: input.body, editVersion: 0 };
      posts.push(post); layout.order.push(post.id);
      return route.fulfill({ json: { post, layout } });
    });
    await page.goto("https://social.test/");
    await expect(page.getByRole("tab", { name: /Symposium Day/ })).toHaveAttribute("aria-selected", "true");
    const firstText = page.getByRole("textbox", { name: "Post text for Breakfast and Registration", exact: true });
    await firstText.fill("A human-edited welcome post."); await firstText.blur();
    await expect.poll(() => posts[0].body).toBe("A human-edited welcome post.");
    await page.getByRole("button", { name: "New post", exact: true }).click();
    await page.getByLabel("Post title", { exact: true }).fill("Extra event moment");
    await page.getByLabel("Post text", { exact: true }).fill("An editable additional post.");
    await page.getByRole("button", { name: "Save draft", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Post text for Extra event moment", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Move Extra event moment up", exact: true }).click();
    await expect.poll(() => layout.order.join(",")).toBe("day-0,manual,day-1");
    await page.reload();
    await expect(page.locator("section").nth(1)).toContainText("Extra event moment");
    await page.locator("section").nth(1).getByRole("button", { name: "Delete post", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete post", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "Post text for Extra event moment", exact: true })).toHaveCount(0);
    await page.reload(); await expect(page.locator("section")).toHaveCount(2);
    await page.getByRole("button", { name: "Add email for Test Attendee", exact: true }).click();
    await page.getByRole("textbox", { name: "Email address for Test Attendee", exact: true }).fill("attendee@example.org");
    await page.getByRole("button", { name: "Save email for Test Attendee", exact: true }).click();
    await expect(page.getByText("Email recorded", { exact: true })).toBeVisible();
    assert.equal(savedEmail, "attendee@example.org"); assert.equal(emailWrites, 1); assert.equal(publications, 0);
    await mkdir("output", { recursive: true }); await page.screenshot({ path: "output/symposium-day-desktop.png" });
    for (const width of [390, 320]) { await page.setViewportSize({ width, height: 1000 }); assert.equal(await page.locator("body").evaluate(node => node.scrollWidth > window.innerWidth), false, `no overflow at ${width}px`); }
    await page.screenshot({ path: "output/symposium-day-mobile.png" });
    assert.deepEqual(errors, []);
    console.log("PASS: day-of tab, inline edit, create, shared reorder, deletion persistence, missing email entry, no publication and responsive layouts");
  } finally { await browser.close(); }
}

void main();
