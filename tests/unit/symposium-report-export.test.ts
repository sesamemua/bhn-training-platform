import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import * as document from "../../src/lib/symposium-report/document";
import * as brief from "../../src/lib/page-review/brief";
import * as overlay from "../../src/lib/page-review/overlay-source";
import * as snapshot from "../../src/lib/symposium-report/review-snapshot";
import * as limits from "../../src/lib/page-review/limits";
import { createHash } from "node:crypto";
import * as paginate from "../../src/lib/symposium-report/paginate";
import * as changes from "../../src/lib/symposium-report/changes";
import * as social from "../../src/lib/social/copy-review";

test("copying report comments freezes the same round; stale requests and subsequent comment writes are refused", async () => {
  let signedIn = true, writes = 0, transactions = 0;
  const comments: Record<string, unknown>[] = [{ id: "note", reviewId: document.REPORT_ID, parentId: null, round: 2, status: "open", authorName: "Reviewer", authorKind: "user", body: "Keep this requested change.", anchorQuote: "Report text" }];
  const draft = { cover: { title: "Report", theme: "Workforce", date: "October" }, pages: [{ id: "summary", label: "Overview", title: "Summary", text: "Report text", frames: 1 }], back: { title: "BioHubNet", text: "Connect" } };
  const review = { pastedHtml: JSON.stringify(draft), id: document.REPORT_ID, title: "Report", url: "https://bhn.test/review/symposium-2026/report", kind: "report", round: 2, status: "open", comments };
  const db = {
    pageReview: {
      findUnique: async () => ({ ...review }),
      update: async ({ data }: { data: Record<string, unknown> }) => { Object.assign(review, data); writes++; return review; },
    },
    pageComment: {
      count: async () => comments.length,
      create: async ({ data }: { data: Record<string, unknown> }) => { comments.push(data); },
    },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async () => signedIn ? { user: { id: "staff", name: "Staff", role: "instructor" } } : null },
    "@/lib/page-review/feedback-memory":{captureReviewFeedback:async()=>{}},"@/lib/prisma": { prisma: db },
    "@/lib/symposium-report/store": { reportRevision: (text: string) => createHash("sha256").update(text).digest("hex"), reportTransaction: async (run: (tx: typeof db) => Promise<Response>) => { transactions++; return run(db); } },
    "@/lib/symposium-report/document": document,
    "@/lib/symposium-report/paginate": paginate,
    "@/lib/symposium-report/changes": changes,
    "@/lib/symposium-report/review-snapshot": snapshot,
    "@/lib/page-review/brief": brief,
    "@/lib/page-review/overlay-source": overlay,
    "@/lib/page-review/limits": limits,
    "@/lib/social/copy-review": social,
  };
  const require = createRequire(import.meta.url);
  const load = (file: string) => {
    const compiled = ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const exports: Record<string, (...args: unknown[]) => Promise<Response>> = {};
    new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
    return exports;
  };
  const route = load("src/app/api/workspace/symposium-2026/report/review/route.ts");
  const mutation = load("src/app/api/workspace/page-review/[id]/route.ts");
  const request = (body: unknown) => new Request("https://bhn.test/api/workspace/symposium-2026/report/review", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const copy = (expectedRound = 2) => route.POST(request({ action: "export", expectedRound }));
  signedIn = false;
  assert.equal((await copy()).status, 403);
  assert.equal(transactions, 0);
  assert.equal((await route.GET(new Request("https://bhn.test/api/review?document=1"))).status, 403);
  signedIn = true;
  const synced = await (await route.GET(new Request("https://bhn.test/api/review?document=1"))).json();
  assert.deepEqual(synced.report, draft);
  assert.equal(synced.revision, createHash("sha256").update(review.pastedHtml).digest("hex"));
  assert.equal(synced.review.status, "open");
  assert.equal((await route.GET(new Request("https://bhn.test/api/review?brief=1"))).status, 409, "old copy clients cannot read an unlocked brief");
  assert.equal((await copy(1)).status, 409);
  assert.equal(writes, 0);
  const response = await copy();
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.match(result.brief, /Keep this requested change/);
  assert.equal(result.review.round, 2);
  assert.equal(result.review.status, "exported");
  assert.equal(review.round, 2, "copy never advances a round");
  assert.equal(writes, 1);
  assert.equal((await copy()).status, 200);
  assert.equal(writes, 1, "re-copy is idempotent");
  const saveRoute = load("src/app/api/workspace/symposium-2026/report/route.ts");
  assert.equal((await saveRoute.POST(request({ action: "save", round: 2, revision: createHash("sha256").update(review.pastedHtml).digest("hex"), report: draft }))).status, 409, "exported rounds also reject autosave writes");
  assert.equal(writes, 1);
  for (const action of ["addComment", "editComment", "deleteComment", "setStatus", "reopenComment", "reopenRound"]) {
    const blocked = await mutation.POST(request({ action, expectedRound: 2, body: "Late note" }), { params: Promise.resolve({ id: document.REPORT_ID }) });
    assert.equal(blocked.status, 409, action + " is frozen");
    assert.equal((await blocked.json()).locked, true);
  }
  assert.equal(comments.length, 1);
  review.round = 3; review.status = "open";
  assert.equal((await copy(2)).status, 409);
  assert.equal(review.status, "open", "an older copy button cannot lock the new round");
  assert.equal((await mutation.POST(request({ action: "addComment", expectedRound: 3, body: "New-round feedback" }), { params: Promise.resolve({ id: document.REPORT_ID }) })).status, 200);
  assert.equal(comments.at(-1)!.round, 3);
  review.status = "closed";
  assert.equal((await copy(3)).status, 200);
  assert.equal(review.status, "closed", "copy never changes an approved report back to exported");
});
