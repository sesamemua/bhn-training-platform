import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as copy from "../../src/lib/social/copy-review";

const compiled = ts.transpileModule(readFileSync("src/app/api/workspace/social-review/[id]/route.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const require = createRequire(import.meta.url);

function fixture({ admin = true, stale = false, closed = false, failedArchive = false } = {}) {
  const original = { status: "draft", editVersion: 5, body: "First paragraph\n\nSecond paragraph", assetSpec: { title: "News" }, trackChanges: true };
  const post = { ...original };
  const oldHtml = JSON.stringify(copy.socialCopySnapshot(original.body, original.assetSpec));
  const review = { round: 2, status: closed ? "closed" : "open", pastedHtml: stale ? JSON.stringify({ title: "News", body: "Older" }) : oldHtml };
  const archives: { round: number; html: string }[] = [], audit: { actorId: string; detail: string }[] = [];
  const tx = {
    socialPost: { findUnique: async () => post },
    pageReview: { findUnique: async () => review, update: async ({ data }: { data: { pastedHtml: string } }) => { review.pastedHtml = data.pastedHtml; review.round++; } },
    pageReviewVersion: { create: async ({ data }: { data: { round: number; html: string } }) => { if (failedArchive) throw new Error("Archive failure"); archives.push(data); } },
    auditLog: { create: async ({ data }: { data: { actorId: string; detail: string } }) => { audit.push(data); } },
  };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return admin ? { user: { id: "reviewer" } } : null; } },
    "@/lib/prisma": { prisma: tx }, "@/lib/page-review/brief": {}, "@/lib/page-review/limits": {}, "@/lib/page-review/overlay-source": {},
    "@/lib/social/copy-review": copy,
    "@/lib/social/edit": { editSocialPost: async (db: typeof tx, actorId: string, input: { id: string; body: string; expectedVersion: number; trackChanges: boolean }) => {
      assert.equal(db, tx); assert.equal(actorId, "reviewer"); assert.equal(input.expectedVersion, 5); assert.equal(input.trackChanges, true);
      if (post.body === input.body) return { status: 200, result: { ok: true, post: { ...post } } };
      // Keep the originally read record immutable, as Prisma does.
      const next = { ...post, body: input.body, editVersion: 6 };
      db.socialPost.findUnique = async () => next;
      return { status: 200, result: { ok: true, post: next } };
    } },
    "@/lib/symposium-report/store": { reportTransaction: async (run: (db: typeof tx) => Promise<Response>) => {
      const originalLookup = tx.socialPost.findUnique;
      const initial = { ...review };
      try { return await run(tx); } catch (error) { tx.socialPost.findUnique = originalLookup; Object.assign(review, initial); throw error; }
    } },
  };
  const route = {} as { PATCH: (request: Request, context: { params: Promise<{ id: string }> }) => Promise<Response> };
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), route);
  const payload = { round: 2, version: 5, edits: [{ part: 0, before: "First paragraph", after: "• First item\n• Second item" }] };
  return { patch: (body = payload) => route.PATCH(new Request("https://review.test/social", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
  }), { params: Promise.resolve({ id: "post" }) }), payload, archives, audit, review, oldHtml, body: () => tx.socialPost.findUnique() };
}

test("Social review edits one draft revision, retains the exact prior snapshot, and attributes the editor", async () => {
  const f = fixture();
  assert.equal((await f.patch()).status, 200);
  assert.equal((await f.body()).body, "• First item\n• Second item\n\nSecond paragraph");
  assert.deepEqual(f.archives.map(row => [row.round, row.html]), [[2, f.oldHtml]]);
  assert.equal(f.review.round, 3);
  assert.equal(f.audit[0].actorId, "reviewer");
});

test("Social editing refuses unauthorized, closed, stale, or ambiguous revisions and rolls back on archive failure", async () => {
  for (const [options, status] of [[{ admin: false }, 403], [{ closed: true }, 409], [{ stale: true }, 409]] as const) {
    const f = fixture(options);
    assert.equal((await f.patch()).status, status); assert.equal(f.archives.length, 0); assert.equal(f.audit.length, 0);
  }
  const f = fixture();
  assert.equal((await f.patch({ ...f.payload, edits: [...f.payload.edits, ...f.payload.edits] })).status, 409);
  const failed = fixture({ failedArchive: true });
  await assert.rejects(failed.patch(), /Archive failure/);
  assert.equal((await failed.body()).body, "First paragraph\n\nSecond paragraph"); assert.equal(failed.review.round, 2);
});
