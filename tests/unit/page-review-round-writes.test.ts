/* eslint-disable @typescript-eslint/no-explicit-any -- Transactional route fixtures. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { Prisma } from "@prisma/client";
const require = createRequire(import.meta.url);
function load(path: string, mocks: Record<string, any>) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const result: any = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), result);
  return result;
}
function fixture() {
  let review = { id: "newsletter-test", round: 4, status: "open" };
  let comments: any[] = [{ id: "current", round: 4, parentId: null, body: "Original", authorUserId: "a" },
    { id: "older", round: 3, parentId: null, body: "Old round", authorUserId: "a" }];
  let conflict = false, transactions = 0;
  const evidence: string[] = [];
  const db: any = {
    pageReview: { findUnique: async () => ({ ...review }), update: async () => ({}) },
    pageComment: {
      count: async () => 0, findFirst: async ({ where }: any) => comments.find(c => c.id === where.id),
      findMany: async () => comments,
      create: async ({ data }: any) => { const c = { ...data, id: "new" }; comments.push(c); return c; },
      update: async ({ where, data }: any) => Object.assign(comments.find(c => c.id === where.id), data),
      deleteMany: async () => { comments = []; return { count: 1 }; },
    },
    $transaction: async (run: any, options: any) => {
      assert.equal(options.isolationLevel, "Serializable");
      transactions++;
      const before = structuredClone(comments), historyLength = evidence.length;
      const result = await run(db);
      if (conflict) {
        conflict = false; comments = before; evidence.length = historyLength;
        review = { ...review, round: 5 };
        throw new Prisma.PrismaClientKnownRequestError("Round changed", { code: "P2034", clientVersion: "test" });
      }
      return result;
    },
  };
  const store = load("src/lib/symposium-report/store.ts", { "@/lib/prisma": { prisma: db },
    "./comment-anchor-store": {}, "./document": {} });
  const route = load("src/app/api/public/page-review/[token]/route.ts", {
    "@/lib/prisma": { prisma: db }, "@/lib/symposium-report/store": store,
    "@/lib/page-review/viewer": { verifyPageReviewViewerToken: async () => ({ userId: "a", name: "Reviewer A", kind: "user" }) },
    "@/lib/page-review/feedback-memory": { captureReviewFeedback: async (_db: any, _id: string, _rows: any, event: string) => evidence.push(event) },
  });
  const call = (method: string, body: object) => route[method](new Request("https://test/api", {
    method, headers: { Authorization: "Bearer viewer", "Content-Type": "application/json" }, body: JSON.stringify(body),
  }), { params: Promise.resolve({ token: "token" }) });
  return { call, comments: () => comments, evidence, conflict: () => { conflict = true; },
    transactions: () => transactions, lock: () => { review.status = "exported"; } };
}
test("newsletter create/reply/edit/delete reject old or absent round proof", async () => {
  for (const round of [undefined, 3]) for (const [method, body] of [
    ["POST", { body: "Feedback" }], ["POST", { body: "Reply", parentId: "current" }],
    ["PATCH", { id: "current", body: "Changed" }], ["DELETE", { id: "current" }],
  ] as const) {
    const f = fixture();
    assert.equal((await f.call(method, { ...body, expectedRound: round })).status, 409);
    assert.equal(f.evidence.length, 0);
    assert.equal(f.comments().length, 2);
    assert.equal(f.comments()[0].body, "Original");
  }
});
test("historical comments are read-only even with current-round proof", async () => {
  for (const [method, body] of [["POST", { body: "Reply", parentId: "older" }],
    ["PATCH", { id: "older", body: "Changed" }], ["DELETE", { id: "older" }]] as const) {
    const f = fixture();
    assert.equal((await f.call(method, { ...body, expectedRound: 4 })).status, 409);
    assert.equal(f.evidence.length, 0);
  }
});
test("Serializable retry rechecks round and rolls back comment and evidence", async () => {
  const f = fixture(); f.conflict();
  const response = await f.call("POST", { body: "Feedback on version 4", expectedRound: 4 });
  assert.equal(response.status, 409);
  assert.equal(f.transactions(), 2, "exercise the real retry wrapper");
  assert.equal(f.comments().length, 2);
  assert.deepEqual(f.evidence, []);
});
test("current-round replies inherit their target and status changes retain evidence", async () => {
  const f = fixture();
  assert.equal((await f.call("POST", { body: "Reply", expectedRound: 4, parentId: "current" })).status, 200);
  assert.equal(f.comments().at(-1).parentId, "current");
  assert.equal((await f.call("PATCH", { id: "current", expectedRound: 4, status: "resolved" })).status, 200);
  assert.equal(f.comments()[0].body, "Original");
  assert.equal(f.comments()[0].status, "resolved");
  assert.deepEqual(f.evidence, ["created", "baseline", "edited"]);
  f.lock();
  assert.equal((await f.call("POST", { body: "Locked", expectedRound: 4 })).status, 409);
});
