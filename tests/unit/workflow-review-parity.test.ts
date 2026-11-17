import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import * as versions from "../../src/lib/design-review/versions";
import * as designTypes from "../../src/lib/design-review/types";
import * as copy from "../../src/lib/social/copy-review";
import * as socialNotes from "../../src/lib/social/review";
import * as brief from "../../src/lib/page-review/brief";
import * as limits from "../../src/lib/page-review/limits";
import { trainingEmailReviewId, trainingEmailReviewLink } from "../../src/lib/training-week/email-review";

function load(file: string, mocks: Record<string, unknown>) {
  const require = createRequire(import.meta.url);
  const code = ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  const result: Record<string, (...args: any[]) => Promise<any>> = {};
  new Function("require", "exports", code)((name: string) => mocks[name] ?? require(name), result);
  return result;
}

const oldPage = { url: "https://assets.test/old.png", key: "design-review/old.png", w: 1200, h: 800 };
const newPage = { ...oldPage, url: "https://assets.test/new.png", key: "design-review/new.png" };

test("artwork replacements carry notes, retain old assets and reset sign-off only after winning the revision", async () => {
  const current = { round: 2, pages: [oldPage], versions: [], updatedAt: new Date() };
  let count = 1, reset = 0;
  const tx = {
    designArtwork: { findUnique: async () => current, updateMany: async ({ where, data }: any) => {
      assert.deepEqual(where, { id: "art", round: 2, updatedAt: current.updatedAt });
      assert.deepEqual(data.pages, [newPage]);
      assert.deepEqual(data.versions, [{ round: 2, pages: [oldPage] }]);
      assert.equal(data.approval, "pending");
      assert.equal(data.lockedAt, null);
      assert.equal(data.round, 3);
      return { count };
    } },
    designReview: { updateMany: async () => { reset++; } },
  };
  const api = load("src/lib/design-review/revise.ts", {
    "@/lib/prisma": { prisma: { $transaction: async (run: any) => run(tx) } },
    "./versions": versions, "./types": designTypes,
  });
  assert.equal(await api.reviseDesignArtwork("art", [newPage], {}), true);
  assert.equal(reset, 1);
  count = 0;
  assert.equal(await api.reviseDesignArtwork("art", [newPage], {}), false);
  assert.equal(reset, 1, "a stale upload may not reset anyone's sign-off");
  assert.deepEqual(versions.allDesignPages({ pages: [oldPage], versions: [{ round: 1, pages: [oldPage] }, { round: 2, pages: [newPage] }] }), [oldPage, newPage]);
  assert.deepEqual(versions.archiveDesignRound({ round: 1, pages: [], versions: [] }), []);
});

test("saving one private social review imports earlier notes once, preserves prior copies and never publishes", async () => {
  let authorized = false, review: any = null;
  const post = { body: "Shared event draft", assetSpec: { title: "<script>Named draft</script>" }, status: "draft", editVersion: 10 };
  const archive = new Map<number, string>();
  let imports: any[] = [];
  const tx = {
    socialPost: { findUnique: async () => post },
    pageReview: {
      findUnique: async () => review,
      create: async ({ data }: any) => { review = { ...data, round: 1, status: "open" }; },
      update: async ({ data }: any) => { review = { ...review, ...data, round: review.round + data.round.increment }; },
    },
    pageReviewVersion: { create: async ({ data }: any) => { archive.set(data.round, data.html); } },
    pageComment: { createMany: async ({ data }: any) => { imports = [...imports, ...data]; } },
    auditLog: { findMany: async () => [
      { id: "one", detail: JSON.stringify({ body: "Earlier feedback" }), actorId: "author", actor: { name: "Author" }, createdAt: new Date() },
      { id: "two", detail: JSON.stringify({ body: "Email note", reviewerId: "admin" }), actorId: "author", actor: { name: "Author" }, createdAt: new Date() },
    ] },
  };
  const api = load("src/lib/social/copy-review-actions.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return authorized ? { user: { id: "admin" } } : null; } },
    "@/lib/prisma": { prisma: tx }, "@/lib/symposium-report/store": { reportTransaction: async (fn: any) => fn(tx) },
    "@/lib/workspace-review-invites": {},
    "@/lib/page-review/staff-history": {},
    "./copy-review": copy, "./review": socialNotes,
  });
  assert.equal((await api.saveSocialCopyReview("post", 0, 10)).ok, false);
  assert.equal(await tx.pageReview.findUnique(), null);
  authorized = true;
  assert.equal((await api.saveSocialCopyReview("post", 0, 10)).ok, true);
  assert.equal(review.kind, "social");
  assert.equal(review.shareToken, undefined, "the public pasted-review route is never issued a token");
  assert.equal(imports.length, 1);
  assert.equal(imports[0].authorUserId, "author");
  assert.equal((await api.saveSocialCopyReview("post", 1, 10)).ok, true);
  assert.equal(review.round, 1);
  post.body = "Revised event draft"; post.editVersion++;
  assert.equal((await api.saveSocialCopyReview("post", 1, 10)).ok, false);
  assert.equal((await api.saveSocialCopyReview("post", 1, 11)).ok, true);
  assert.equal(review.round, 2);
  assert.equal(imports.length, 1);
  assert.match(archive.get(1)!, /Shared event draft/);
  const html = copy.socialCopySnapshotHtml(archive.get(1)!);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  post.status = "published";
  assert.equal((await api.saveSocialCopyReview("post", 2, 11)).ok, false);
});

test("private Social reader authorizes before reading, hides author IDs and only returns selected saved rounds", async () => {
  let authorized = false, reads = 0;
  const snapshots = [1, 2, 3, 4].map((round) => ({ round, html: JSON.stringify({ title: "Event", body: `Draft ${round}` }) }));
  const api = load("src/app/api/workspace/social-review/[id]/route.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return authorized ? { user: { id: "private", name: "Review staff" } } : null; } },
    "@/lib/prisma": { prisma: {
      socialPost: { findUnique: async () => { reads++; return { status: "scheduled" }; } },
      pageReview: { findUnique: async ({ where, select }: any) => {
        assert.deepEqual(where, { id: "social-copy-one", kind: "social" });
        return { title: "Event", round: 4, status: "open", ...(select.comments
          ? { comments: [{ id: "note", authorUserId: "private", reviewId: "social-copy-one", body: "Comment" }] }
          : { pastedHtml: snapshots[3].html, versions: snapshots.slice(0, 3) }) };
      } },
      pageReviewVersion: { findMany: async ({ where }: any) => snapshots.filter((entry) => where.round.in.includes(entry.round)) },
    } },
    "@/lib/page-review/brief": brief, "@/lib/page-review/limits": limits,
    "@/lib/page-review/overlay-source": { overlaySource: () => "/* overlay */" },
    "@/lib/social/copy-review": copy,
  });
  const get = (query = "") => api.GET(new Request(`https://review.test/api/workspace/social-review/one${query}`), { params: Promise.resolve({ id: "one" }) });
  for (const q of ["", "?overlay=1", "?brief=1", "?comparison=1"]) assert.equal((await get(q)).status, 403);
  assert.equal(reads, 0);
  authorized = true;
  const res = await get();
  assert.equal(res.headers.get("cache-control"), "private, no-store");
  const loaded = await res.json();
  assert.equal(loaded.review.status, "closed", "scheduling puts the copy review into read-only mode");
  assert.deepEqual(loaded.comments, [{ id: "note", body: "Comment", isMine: true }]);
  assert.equal((await get("?comparison=1&rounds=3,3")).status, 400);
  const compared = await (await get("?comparison=1&rounds=1,3,4")).json();
  assert.deepEqual(compared.comparison.versions.map((entry: any) => entry.round), [1, 3, 4]);
  assert.doesNotMatch(JSON.stringify(compared), /Draft 2/);
});

test("Training Week feedback copying is read-only and sign-off rejects stale or outstanding review rounds", async () => {
  let authorized = false, stale = false, status = "open", open = 1, approvals = 0, reads = 0;
  const tx = {
    pageReview: {
      findUnique: async () => { reads++; return { title: "Check-in emails", round: 1, comments: [] }; },
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.id, "training-week-emails-event");
        if (where.round !== 1 || where.status !== status) return { count: 0 };
        status = data.status; return { count: 1 };
      },
    },
    pageComment: { count: async () => open },
    auditLog: { create: async ({ data }: any) => { assert.equal(data.action, "training_week.email_review.approve"); approvals++; } },
  };
  const api = load("src/app/(dashboard)/admin/workspace/training-admin/email-review-tools.ts", {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "admin"); return authorized ? { user: { id: "admin" } } : null; } },
    "@/lib/prisma": { prisma: tx }, "@/lib/page-review/brief": brief, "@/lib/page-review/limits": limits,
    "@/lib/page-review/staff-history": { reviewSentHistory: async () => [] },
    "@/lib/training-week/email-review": { trainingEmailReviewId, trainingEmailReviewLink },
    "@/lib/symposium-report/store": { reportTransaction: async (fn: any) => fn(tx) },
    "./email-review-actions": { loadTrainingEmailReview: async () => ({ ok: true, bundle: { stale, review: { round: 1 } } }) },
  });
  await assert.rejects(api.copyTrainingReviewFeedback("event"), /Forbidden/);
  assert.equal(reads, 0);
  authorized = true;
  assert.match(await api.copyTrainingReviewFeedback("event"), /No open comments/);
  assert.equal(status, "open");
  assert.match((await api.approveTrainingReview("event", 1)).error, /outstanding/);
  stale = true;
  assert.match((await api.approveTrainingReview("event", 1)).error, /current revision/);
  stale = false; open = 0;
  assert.equal((await api.approveTrainingReview("event", 1)).ok, true);
  assert.equal(status, "approved");
  assert.equal(approvals, 1);
  assert.equal((await api.approveTrainingReview("event", 1)).ok, false);
});
