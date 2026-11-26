import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
function load<T>(path: string, mocks: Record<string, unknown>): T {
  const code = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  new Function("require", "exports", code)((key: string) => Object.hasOwn(mocks, key) ? mocks[key] : require(key), exports);
  return exports as T;
}

const review = { id: "newsletter-issue", status: "open", round: 5, kind: "paste" };
const payload = { round: 5, target: "p#intro", baseline: "a".repeat(64), body: "Private new wording" };
const url = "https://review.test/fixture";
function request(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(url, { method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { "Content-Type": "application/json", ...headers } });
}

test("checkpoint is an owner-scoped upsert; locked and stale rounds never write", async () => {
  const calls: { sql: string; args: unknown[] }[] = [];
  const store = load<{ textCheckpoint(req: Request, scope: typeof review, owner: string): Promise<Response> }>("src/lib/page-review/text-checkpoint.ts", {
    "@/lib/prisma": { prisma: {
      $queryRaw: (strings: TemplateStringsArray, ...args: unknown[]) => { calls.push({ sql: strings.join("?"), args }); return []; },
      $executeRaw: (strings: TemplateStringsArray, ...args: unknown[]) => { calls.push({ sql: strings.join("?"), args }); return 1; },
    } },
  });
  assert.equal((await store.textCheckpoint(request("PUT", { ...payload, round: 4 }), review, "reviewer-a")).status, 409);
  assert.equal((await store.textCheckpoint(request("PUT", payload), { ...review, status: "closed" }, "reviewer-a")).status, 409);
  assert.equal((await store.textCheckpoint(request("PUT", { ...payload, owner: "reviewer-b" }), review, "reviewer-a")).status, 400);
  assert.equal(calls.length, 0);
  const res = await store.textCheckpoint(request("PUT", payload), review, "reviewer-a");
  const { etag } = await res.json();
  assert.equal(res.status, 200);
  assert.match(calls[0].sql, /ON CONFLICT \("reviewId", "owner"\) DO UPDATE/);
  assert.doesNotMatch(calls[0].sql, /PageReviewVersion|PageComment/);
  assert.deepEqual(calls[0].args, ["reviewer-a", payload.target, payload.baseline, payload.body, etag, review.id, 5]);
  await store.textCheckpoint(request("GET"), review, "reviewer-b");
  assert.deepEqual(calls[1].args, [review.id, "reviewer-b", 5]);
  await store.textCheckpoint(request("DELETE", { etag }), review, "reviewer-a");
  assert.deepEqual(calls[2].args, [review.id, "reviewer-a", etag]);
});

test("public checkpoint uses the verified account, never a guest or a sent newsletter", async () => {
  let kind = "anon", isActive = true, hasDraft = false; const owners: string[] = [];
  const route = load<{ PUT(req: Request, ctx: { params: Promise<{ token: string }> }): Promise<Response> }>("src/app/api/public/page-review/[token]/text-checkpoint/route.ts", {
    "@/lib/prisma": { prisma: { pageReview: { findUnique: async () => review },
      user: { findUnique: async () => ({ role: "instructor", isActive }) }, newsletterIssue: { findFirst: async () => hasDraft ? { id: "issue" } : null },
    } },
    "@/lib/page-review/viewer": { verifyPageReviewViewerToken: async (token: string, id: string) => {
      assert.equal(token, "fixture"); assert.equal(id, review.id); return { kind, userId: "verified-owner" };
    } },
    "@/lib/page-review/text-checkpoint": { checkpointResponse: (data: unknown, status: number) => Response.json(data, { status }),
      textCheckpoint: (_req: Request, _review: typeof review, owner: string) => { owners.push(owner); return Response.json({ ok: true }); },
    },
  });
  const put = () => route.PUT(request("PUT", payload, { Authorization: "Bearer fixture" }), { params: Promise.resolve({ token: "fixture" }) });
  assert.equal((await put()).status, 403);
  kind = "user"; isActive = false; assert.equal((await put()).status, 403);
  isActive = true; assert.equal((await put()).status, 409);
  assert.deepEqual(owners, []);
  hasDraft = true; assert.equal((await put()).status, 200);
  assert.deepEqual(owners, ["verified-owner"]);
});
