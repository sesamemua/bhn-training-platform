/* eslint-disable @typescript-eslint/no-explicit-any -- Transactional route fixture. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { editableTextNodes } from "../../src/lib/page-review/editable-text";
import { editReviewHtml, htmlRevision } from "../../src/lib/page-review/edit-html";

const html = '<style>p{color:teal}</style><h2>Title</h2><p>Hello <a href="https://example.test/register">Register</a> today.</p><p>Last line</p>';
test("plain-text patches preserve links, tables and styles and escape pasted markup", () => {
  const nodes = editableTextNodes(new JSDOM("<body>" + html + "</body>").window.document);
  assert.deepEqual(nodes.map(n => n.data), ["Title", "Hello ", "Register", " today.", "Last line"]);
  const result = editReviewHtml(html, [{ index: 2, before: "Register", after: '<img src=x onerror="alert(1)">' }]);
  const doc = new JSDOM("<body>" + result + "</body>").window.document;
  assert.equal(doc.querySelector("a")?.href, "https://example.test/register");
  assert.equal(doc.querySelector("a")?.textContent, '<img src=x onerror="alert(1)">');
  assert.equal(doc.querySelectorAll("img").length, 0);
  assert.match(result, /p\{color:teal\}/);
  assert.throws(() => editReviewHtml(html, [{ index: 0, before: "Wrong", after: "New" }]), /selected text changed/);
  assert.throws(() => editReviewHtml(html, [{ index: 999, before: "Title", after: "New" }]), /selected text changed/);
});
test("text-node collection ignores review UI and scripts; full documents retain their head", () => {
  const full = '<!doctype html><html><head><style>body{color:black}</style></head><body><h1>Heading</h1><div id="bhn-review-overlay"><p>Private tools</p></div><aside data-bhn-review-ui><span>Copy</span></aside><script>bad()</script></body></html>';
  assert.deepEqual(editableTextNodes(new JSDOM(full).window.document).map(n => n.data), ["Heading"]);
  const result = editReviewHtml(full, [{ index: 0, before: "Heading", after: "Edited heading" }]);
  assert.match(result, /<head><style>body\{color:black\}<\/style><\/head>/);
  assert.doesNotMatch(result, /<script/);
});

const require = createRequire(import.meta.url);
function fixture(options: { role?: string; active?: boolean; guest?: boolean; sent?: boolean; conflict?: boolean } = {}) {
  let review = { id: "newsletter-issue", shareToken: "token", kind: "paste", status: "open", round: 4, pastedHtml: html };
  let issueHtml = html;
  const snapshots: any[] = [], audit: any[] = [];
  const db: any = {
    user: { findUnique: async () => ({ id: "staff", role: options.role ?? "instructor", isActive: options.active !== false }) },
    pageReview: { findUnique: async () => review, updateMany: async ({ data }: any) => { review = { ...review, ...data, round: 5 }; return { count: 1 }; } },
    newsletterIssue: { findUnique: async () => ({ status: options.sent ? "sent" : "generated", updatedAt: new Date("2026-11-25T15:00:00Z") }),
      updateMany: async ({ data }: any) => { if (options.sent || options.conflict) return { count: 0 }; issueHtml = data.renderedHtml; return { count: 1 }; } },
    pageReviewVersion: { create: async ({ data }: any) => snapshots.push(data) },
    auditLog: { create: async ({ data }: any) => audit.push(data) },
  };
  const mocks: any = {
    "@/lib/prisma": { prisma: db }, "@/lib/page-review/edit-html": { editReviewHtml, htmlRevision },
    "@/lib/page-review/viewer": { verifyPageReviewViewerToken: async () => ({ userId: "staff", kind: options.guest ? "anon" : "user" }) },
    "@/lib/symposium-report/store": { reportTransaction: async (run: any) => {
      const previous = structuredClone(review), oldHtml = issueHtml;
      try { return await run(db); } catch (error) { review = previous; issueHtml = oldHtml; snapshots.length = 0; audit.length = 0; throw error; }
    } },
  };
  const compiled = ts.transpileModule(readFileSync("src/app/api/public/page-review/[token]/document/route.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const route: any = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), route);
  const payload = { expectedRound: 4, revision: htmlRevision(html), issueRevision: "2026-11-25T15:00:00.000Z", edits: [{ index: 0, before: "Title", after: "Edited title" }] };
  const call = (method: string, body: unknown = payload) => route[method](new Request("https://review.test/api", {
    method, headers: { Authorization: "Bearer staff-token" }, ...(method === "GET" ? {} : { body: typeof body === "string" ? body : JSON.stringify(body) }),
  }), { params: Promise.resolve({ token: "token" }) });
  return { call, payload, snapshots, audit, review: () => review, issue: () => issueHtml };
}
test("saving one batch produces one archived round, updated export, and an attributed audit", async () => {
  const f = fixture();
  const meta = await (await f.call("GET")).json();
  assert.equal(meta.editable, true);
  assert.equal((await f.call("PATCH")).status, 200);
  assert.equal(f.review().round, 5);
  assert.equal(f.snapshots.length, 1);
  assert.equal(f.snapshots[0].html, html);
  assert.match(f.issue(), /Edited title/);
  assert.equal(f.audit[0].actorId, "staff");
});
test("guests, inactive and non-staff accounts cannot edit", async () => {
  for (const opts of [{ guest: true }, { active: false }, { role: "trainee" }]) {
    const f = fixture(opts);
    assert.equal((await f.call("GET")).status, 403);
    assert.equal((await f.call("PATCH")).status, 403);
    assert.equal(f.snapshots.length, 0);
  }
});
test("stale, locked/sent and concurrent issue changes do not mutate either record", async () => {
  for (const opts of [{ sent: true }, { conflict: true }]) {
    const f = fixture(opts);
    assert.equal((await f.call("PATCH")).status, 409);
    assert.equal(f.review().round, 4);
    assert.equal(f.issue(), html);
    assert.equal(f.audit.length, 0);
  }
  const f = fixture();
  for (const body of [{ ...f.payload, expectedRound: 3 }, { ...f.payload, revision: "a".repeat(64) }]) assert.equal((await f.call("PATCH", body)).status, 409);
  assert.equal((await f.call("PATCH", "{invalid")).status, 400);
  assert.equal(f.snapshots.length, 0);
  const locked = fixture();
  locked.review().status = "exported";
  assert.equal((await locked.call("PATCH")).status, 409);
  assert.equal(locked.snapshots.length, 0);
  const unchanged = fixture();
  assert.equal((await unchanged.call("PATCH", { ...unchanged.payload, edits: [{ index: 0, before: "Title", after: "Title" }] })).status, 200);
  assert.equal(unchanged.snapshots.length, 0);
});
