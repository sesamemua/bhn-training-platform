/* eslint-disable @typescript-eslint/no-explicit-any -- Transactional route fixture. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { JSDOM } from "jsdom";
import { editableTextNodes, planTextBlockEdits, reviewTextValue } from "../../src/lib/page-review/editable-text";
import { editReviewHtml, htmlRevision } from "../../src/lib/page-review/edit-html";

const html = '<style>p{color:teal}</style><h2>Title</h2><p>Hello <a href="https://example.test/register">Register</a> today.</p><p>Last line</p>';
test("plain-text patches preserve links, tables and styles and escape pasted markup", () => {
  const nodes = editableTextNodes(new JSDOM("<body>" + html + "</body>").window.document);
  assert.deepEqual(nodes.map(reviewTextValue), ["Title", "Hello ", "Register", " today.", "Last line"]);
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
  assert.deepEqual(editableTextNodes(new JSDOM(full).window.document).map(reviewTextValue), ["Heading"]);
  const result = editReviewHtml(full, [{ index: 0, before: "Heading", after: "Edited heading" }]);
  assert.match(result, /<head><style>body\{color:black\}<\/style><\/head>/);
  assert.doesNotMatch(result, /<script/);
});

test("only a plain paragraph can become a styled semantic list; items are literal text", () => {
  const result = editReviewHtml(html, [{ index: 4, before: "Last line", after: "One\n<img src=x onerror=boom>", list: true }]);
  const doc = new JSDOM(result).window.document;
  assert.deepEqual([...doc.querySelectorAll("ul li")].map(node => node.textContent), ["One", "<img src=x onerror=boom>"]);
  assert.equal(doc.querySelectorAll("img").length, 0);
  assert.throws(() => editReviewHtml(html, [{ index: 2, before: "Register", after: "One\nTwo", list: true }]), /plain paragraph/);
});

test("one paragraph edit preserves CASTL and BioZone links and surrounding prose", () => {
  const source = '<p>Build practical skills with <a href="https://castl.example">CASTL</a> and <a href="https://biozone.example"><strong>BioZone</strong></a> this fall.</p>';
  const doc = new JSDOM(source).window.document;
  const nodes = editableTextNodes(doc);
  const edits = planTextBlockEdits(nodes.map((node, index) => ({ index, before: reviewTextValue(node) })), "Strengthen practical skills with CASTL and BioZone this winter.");
  const result = new JSDOM(editReviewHtml(source, edits)).window.document;
  assert.equal(result.querySelector("p")?.textContent, "Strengthen practical skills with CASTL and BioZone this winter.");
  assert.deepEqual(Array.from(result.querySelectorAll("a")).map(a => [a.href, a.textContent]), [["https://castl.example/", "CASTL"], ["https://biozone.example/", "BioZone"]]);
  assert.equal(result.querySelector("a strong")?.textContent, "BioZone");
});

test("whole list-item edits retain emphasized Master's and PhD funding figures", () => {
  const source = '<ul><li>Master’s trainees receive <strong>$25,000</strong>; PhD trainees receive <strong>$30,000</strong> in support.</li></ul>';
  const nodes = editableTextNodes(new JSDOM(source).window.document);
  const edits = planTextBlockEdits(nodes.map((node, index) => ({ index, before: reviewTextValue(node) })), "Master’s trainees receive $26,000; PhD trainees receive $32,000 in support.");
  const result = new JSDOM(editReviewHtml(source, edits)).window.document;
  assert.deepEqual(Array.from(result.querySelectorAll("strong")).map(n => n.textContent), ["$26,000", "$32,000"]);
  assert.equal(result.querySelectorAll("li").length, 1);
});

test("newsletter breaks render in email HTML and remain editable without losing links", () => {
  const after = "Stay\nwith <us> ";
  const htmlWithBreak = editReviewHtml(html, [{ index: 1, before: "Hello ", after }]);
  const doc = new JSDOM(htmlWithBreak).window.document;
  assert.equal(doc.querySelectorAll("p br").length, 1);
  assert.equal(doc.querySelector("a")?.textContent, "Register");
  assert.equal(doc.querySelector("us"), null);
  assert.deepEqual(editableTextNodes(doc).map(reviewTextValue), ["Title", after, "Register", " today.", "Last line"]);
  const joined = new JSDOM(editReviewHtml(htmlWithBreak, [{ index: 1, before: after, after: "Stay with us " }])).window.document;
  assert.equal(joined.querySelector("p")?.textContent, "Stay with us Register today.");
  assert.equal(joined.querySelector("br"), null);
  const formatted = new JSDOM(editReviewHtml(html, [{ index: 1, before: "Hello ", after, marks: [{ kind: "bold", start: 0, end: after.length }] }])).window.document;
  assert.equal(formatted.querySelectorAll("strong br").length, 1);
});

test("block planning rejects ambiguous boundaries and preserves immutable whitespace", () => {
  const parts = [{ index: 0, before: "Join " }, { index: 1, before: "CASTL" }, { index: 2, before: " today." }];
  assert.deepEqual(planTextBlockEdits(parts, "Join \nCASTL today."), [{ index: 0, before: "Join ", after: "Join \n" }]);
  assert.throws(() => planTextBlockEdits(parts, "Learn with BioZone today."), /formatting boundary/);
  assert.throws(() => planTextBlockEdits(parts, "Join our CASTL today."), /formatting boundary/);
  const spaced = [{ index: 0, before: "One" }, { index: null, before: "\n  " }, { index: 1, before: "Two" }];
  assert.deepEqual(planTextBlockEdits(spaced, "First\n  Two"), [{ index: 0, before: "One", after: "First" }]);
  assert.throws(() => planTextBlockEdits(spaced, "One Two"), /formatting boundary/);
  assert.deepEqual(planTextBlockEdits([{ index: 5, before: "Old sentence" }], "Completely new sentence."), [{ index: 5, before: "Old sentence", after: "Completely new sentence." }]);
});

test("block planner remains self-contained when embedded in the isolated reviewer", () => {
  const plan = new Function("return (function(__name){return (" + planTextBlockEdits.toString() + ");})(function(value){return value;})")() as typeof planTextBlockEdits;
  assert.deepEqual(plan([{ index: 4, before: "Hello" }], "Hi"), [{ index: 4, before: "Hello", after: "Hi" }]);
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
    "@/lib/newsletter/review-images": { newsletterReviewImages: async () => [], resolveReviewImageEdits: async () => [],
      saveReviewImageReferences: async () => {}, ReviewImageError: class extends Error {} },
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
test("format-only saves archive an exact prior round and preserve the link; only valid bold and italic ranges are accepted", async () => {
  const f = fixture();
  const patch = { index: 2, before: "Register", after: "Register",
    marks: [{ kind: "bold", start: 0, end: 8 }, { kind: "italic", start: 0, end: 8 }] };
  for (const extra of [
    { ...patch, marks: [{ kind: "size", start: 0, end: 8 }] },
    { ...patch, marks: [{ kind: "bold", start: 0, end: 20 }] },
    { ...patch, list: true },
  ]) assert.equal((await f.call("PATCH", { ...f.payload, edits: [extra] })).status, 400);
  assert.equal(f.snapshots.length, 0);
  assert.equal((await f.call("PATCH", { ...f.payload, edits: [patch] })).status, 200);
  assert.equal(f.review().round, 5);
  assert.equal(f.snapshots[0].html, html);
  const doc = new JSDOM(f.issue()).window.document;
  assert.equal(doc.querySelector("a strong em")?.textContent, "Register");
  assert.equal(doc.querySelector("a")?.href, "https://example.test/register");
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
