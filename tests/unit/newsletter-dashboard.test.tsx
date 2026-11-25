/* eslint-disable @typescript-eslint/no-explicit-any -- Database and HTTP fixtures deliberately exercise runtime states. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement, act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { JSDOM } from "jsdom";
import { NewsletterReviewCard } from "../../src/components/dashboards/NewsletterReviewCard";

function mockedModule(file: string, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const exports: Record<string, any> = {};
  const code = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true,
  } }).outputText;
  new Function("require", "exports", code)((id: string) => mocks[id] ?? require(id), exports);
  return exports;
}

test("dashboard lookup follows the calendar issue and reads only public status fields, without creating issues or rounds", async () => {
  let cycle: any = { issueId: "november", month: "2026-11-01", status: "planned" };
  let issue: any = { id: "november", title: "November Newsletter", status: "generated" };
  let reads = 0;
  const fixture = mockedModule("src/lib/newsletter/dashboard-review.ts", {
    "./currentIssue": { currentCycle: async (today: string) => { assert.match(today, /^\d{4}-\d{2}-\d{2}$/); return cycle; } },
    "@/lib/prisma": { prisma: {
      newsletterIssue: {
        findUnique: async ({ where }: any) => { reads++; assert.equal(where.id, "november"); return issue; },
        findFirst: async ({ where, orderBy }: any) => { assert.equal(where.status.not, "sent"); assert.deepEqual(orderBy, { createdAt: "desc" }); return issue; },
      },
      pageReview: { findUnique: async ({ where, select }: any) => { assert.equal(where.id, "newsletter-november"); assert.deepEqual(select, { id: true, round: true, status: true }); return { id: where.id, round: 2, status: "open" }; } },
    } },
  });
  assert.equal((await fixture.loadNewsletterDashboardReview()).review.round, 2);
  cycle.issueId = null;
  const empty = await fixture.loadNewsletterDashboardReview();
  assert.equal(empty.title, "November 2026 Newsletter"); assert.equal(empty.review, null); assert.equal(reads, 1);
  cycle.issueId = "november"; issue = null;
  assert.equal((await fixture.loadNewsletterDashboardReview()).review, null);
  cycle = null; issue = { id: "november", title: "Unscheduled issue", status: "generated" };
  assert.equal((await fixture.loadNewsletterDashboardReview()).title, "Unscheduled issue");
  cycle = { issueId: "november", month: "2026-11-01", status: "sent" };
  assert.equal((await fixture.loadNewsletterDashboardReview()).sent, true);
});

test("dashboard status endpoint requires staff, avoids caching and fails without leaking database errors", async () => {
  let authorized = false, fail = false, reads = 0;
  const fixture = mockedModule("src/app/api/workspace/newsletter/dashboard-review/route.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "instructor"); return authorized ? { user: { id: "staff" } } : null; } },
    "@/lib/newsletter/dashboard-review": { loadNewsletterDashboardReview: async () => { reads++; if (fail) throw new Error("private database details"); return { review: { round: 2, status: "open" } }; } },
  });
  assert.equal((await fixture.GET()).status, 403); assert.equal(reads, 0);
  authorized = true;
  const response = await fixture.GET();
  assert.equal(response.headers.get("Cache-Control"), "private, no-store"); assert.equal((await response.json()).newsletter.review.round, 2);
  fail = true;
  const failure = await fixture.GET(); assert.equal(failure.status, 503); assert.doesNotMatch(await failure.text(), /private database/);
});

const initial = { issueId: "november", title: "November 2026 Newsletter", sent: false, review: { id: "newsletter-november", round: 2, status: "open" } };
test("card links directly to the open reviewer and distinguishes locked, closed, sent and not-yet-open states", () => {
  const markup = (status: string) => renderToStaticMarkup(createElement(NewsletterReviewCard, { initial: { ...initial, review: { ...initial.review, status } } }));
  assert.match(markup("open"), /Round 2 is open/); assert.match(markup("open"), /href="\/api\/workspace\/page-review\/newsletter-november\/launch"/);
  assert.match(markup("exported"), /Round 2 is locked/); assert.match(markup("exported"), /Wait until they are complete and the next round opens/); assert.doesNotMatch(markup("exported"), /Start reviewing/);
  assert.match(markup("closed"), /Round 2 is closed/); assert.doesNotMatch(markup("closed"), /\/launch/);
  const sent = renderToStaticMarkup(createElement(NewsletterReviewCard, { initial: { ...initial, sent: true } })); assert.match(sent, /Newsletter sent/); assert.doesNotMatch(sent, /Start reviewing|\/launch/);
  assert.match(renderToStaticMarkup(createElement(NewsletterReviewCard, { initial: { ...initial, review: null } })), /Review not open yet/);
});

test("card refreshes rounds and locks on focus, rejects stale status after failure and cancels work on unmount", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test", pretendToBeVisual: true });
  const previous = Object.fromEntries(["window", "document", "fetch", "IS_REACT_ACT_ENVIRONMENT"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let data: any = initial, fail = false, pending = false, signal: AbortSignal | null = null, calls = 0;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async (_url: string, options: RequestInit) => { calls++; assert.equal(options.cache, "no-store"); signal = options.signal as AbortSignal; if (pending) return new Promise(() => {}); return { ok: !fail, json: async () => ({ newsletter: data }) }; },
  });
  const root = createRoot(dom.window.document.querySelector("#root")!);
  const focus = async () => { await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")); }); };
  try {
    await act(async () => root.render(createElement(NewsletterReviewCard, { initial })));
    data = { ...initial, review: { ...initial.review, status: "exported" } }; await focus();
    assert.match(dom.window.document.body.textContent!, /Round 2 is locked/);
    data = { ...initial, review: { ...initial.review, round: 3 } }; await focus();
    assert.match(dom.window.document.body.textContent!, /Round 3 is open/);
    fail = true; await focus(); assert.match(dom.window.document.body.textContent!, /Status unavailable/); assert.doesNotMatch(dom.window.document.body.textContent!, /Round 3 is open/);
    pending = true; await focus(); const before = calls; await focus(); assert.equal(calls, before);
    await act(async () => root.unmount()); assert.equal(signal!.aborted, true);
  } finally {
    dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("winter decoration has bounded deterministic particles, a pause control, and reduced-motion/print fallbacks", () => {
  const component = readFileSync("src/components/design-system/WinterSnowfall.tsx", "utf8");
  const css = readFileSync("src/components/design-system/winter-snowfall.module.css", "utf8");
  assert.match(component, /length: 28/); assert.doesNotMatch(component, /Math.random|requestAnimationFrame|setInterval/);
  assert.match(component, /aria-hidden="true"/); assert.match(component, /Pause snowfall/);
  assert.match(css, /animation-play-state: paused/); assert.match(css, /prefers-reduced-motion: reduce/); assert.match(css, /animation: none/); assert.match(css, /@media print/);
  const header = readFileSync("src/components/design-system/DSPageHeader.tsx", "utf8");
  assert.match(header, /<WinterSnowfall \/>/); assert.doesNotMatch(header, /<MicrofluidicEtching/);
  const page = readFileSync("src/app/(dashboard)/dashboard/page.tsx", "utf8");
  assert.ok(page.indexOf('<NewsletterReviewCard') > page.indexOf('if (role === "admin"'));
  assert.ok(page.indexOf('<NewsletterReviewCard') < page.indexOf('<ShortcutBar'));
});
