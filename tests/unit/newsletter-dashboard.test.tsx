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
import { NewsletterPageReview } from "../../src/components/workspace/NewsletterPageReview";

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
  assert.equal(renderToStaticMarkup(createElement(NewsletterReviewCard, { initial: { ...initial, sent: true } })), "");
  assert.equal(renderToStaticMarkup(createElement(NewsletterReviewCard, { initial: { ...initial, review: null } })), "");
  assert.equal(markup("pending"), "");
  assert.match(markup("open"), /data-newsletter-review-tile/); assert.match(markup("open"), /w-56 max-w-full/); assert.doesNotMatch(markup("open"), /sm:flex-row/);
});

test("draft review stays hidden while mounted, then explicit opening reveals the compact tile", async () => {
  const dom = new JSDOM("<div id='root'></div>", { url: "https://example.test", pretendToBeVisual: true });
  const keys = ["window", "document", "fetch", "IS_REACT_ACT_ENVIRONMENT"];
  const previous = Object.fromEntries(keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let data = { ...initial, review: { ...initial.review, status: "pending" } };
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true,
    fetch: async () => ({ ok: true, json: async () => ({ newsletter: data }) }),
  });
  const root = createRoot(dom.window.document.querySelector("#root")!);
  try {
    await act(async () => root.render(createElement(NewsletterReviewCard, { initial: data })));
    assert.equal(dom.window.document.querySelector('[data-newsletter-review-tile]'), null);
    data = { ...initial, review: { ...initial.review, status: "open" } };
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event("focus")); });
    assert.match(dom.window.document.body.textContent!, /Round 2 is open/);
    assert.ok(dom.window.document.querySelector('[data-newsletter-review-tile]'));
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    for (const [key, descriptor] of Object.entries(previous)) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); }
  }
});

test("opening team review is explicit and guarded; saving a draft never makes it ready", async () => {
  let authorized = true, sent = false, racing = false;
  let row: any = { id: "newsletter-november", round: 2, status: "pending", pastedHtml: "saved draft", shareToken: "same-token" };
  const archives: any[] = [];
  const db: any = {
    newsletterIssue: { findUnique: async () => ({ title: "November", status: sent ? "sent" : "generated" }), update: async () => {} },
    pageReviewVersion: { upsert: async (input: any) => archives.push(input) },
    pageReview: {
      findUnique: async () => ({ ...row }),
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.status, row.status); assert.equal(where.round, row.round);
        if (racing) return { count: 0 };
        row = { ...row, ...data, round: data.round ? row.round + data.round.increment : row.round };
        return { count: 1 };
      },
    },
    $transaction: async (fn: any) => fn(db),
  };
  const fixture = mockedModule("src/app/api/workspace/newsletter/[id]/review/route.ts", {
    "@/lib/auth": { requireRole: async () => authorized ? { user: { id: "editor" } } : null },
    "@/lib/prisma": { prisma: db },
  });
  const call = (body: any) => fixture.POST(new Request("https://example.test/api/workspace/newsletter/november/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id: "november" }) });
  const open = () => call({ action: "release", html: row.pastedHtml, round: row.round });
  authorized = false; assert.equal((await open()).status, 403); authorized = true;
  assert.equal((await call({ action: "release", html: "unsaved changes", round: 2 })).status, 409);
  assert.equal((await call({ action: "release", html: "saved draft", round: 1 })).status, 409);
  sent = true; assert.equal((await open()).status, 409); sent = false;
  const saved = await (await call({ action: "revise", html: "revised draft", round: 2 })).json();
  assert.equal(saved.review.status, "pending"); assert.equal(row.status, "pending"); assert.equal(archives.length, 1);
  racing = true; assert.equal((await open()).status, 409); racing = false;
  const before = { ...row };
  const opened = await (await open()).json(); assert.equal(opened.review.status, "open");
  assert.equal(row.round, before.round); assert.equal(row.pastedHtml, before.pastedHtml); assert.equal(row.shareToken, "same-token"); assert.equal(archives.length, 1);
  assert.equal((await open()).status, 200);
  row.status = "exported"; assert.equal((await open()).status, 409);
  row.status = "closed"; assert.equal((await open()).status, 409);
});

test("newsletter draft controls explain readiness, preserve editing and keep invitations unavailable until opened", async () => {
  const html = renderToStaticMarkup(createElement(NewsletterPageReview, { issueId: "november", html: "saved draft", initialReview: { id: "newsletter-november", round: 2, status: "pending" }, canEdit: true }));
  assert.match(html, /team review is not open yet/); assert.match(html, />Save draft</); assert.match(html, />Open team review</);
  assert.match(html, /class="newsletter-review-launch"/);
  assert.match(html, /href="\/api\/workspace\/newsletter\/november\/review-preview"/);
  assert.doesNotMatch(html, /\/api\/workspace\/page-review\/[^" ]+\/launch|Send review request|Copy review link/);
  const readonly = renderToStaticMarkup(createElement(NewsletterPageReview, { issueId: "november", html: "saved draft", initialReview: { id: "newsletter-november", round: 2, status: "pending" }, canEdit: false }));
  assert.doesNotMatch(readonly, /<button[^>]*>Open team review/);
  assert.match(readonly, /An editor will open team review/); assert.doesNotMatch(readonly, /Save your changes/);
  let sent = 0;
  const fixture = mockedModule("src/lib/newsletter/review-invites.ts", {
    "@/lib/auth": { requireRole: async () => ({ user: { id: "editor" } }) },
    "@/lib/prisma": { prisma: { newsletterIssue: { findUnique: async () => ({ title: "November" }) }, pageReview: { findUnique: async () => ({ status: "pending" }) } } },
    "@/lib/workspace-review-invites": { sendStaffReviewInvites: async () => { sent++; } },
  });
  const result = await fixture.sendNewsletterReviewInvites({ issueId: "november", userIds: ["colleague"] });
  assert.match(result.error, /Open team review/); assert.equal(sent, 0);
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
