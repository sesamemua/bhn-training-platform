import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { NextRequest } from "next/server";
import ts from "typescript";
import * as limits from "../../src/lib/page-review/limits";

type Review = { id: string; title: string; round: number; status: string };
type Content = { kind: string; snapshotHtml: string | null; pastedHtml: string | null };
type FindReview = { where: { shareToken?: string; id?: string; round?: number; status?: string }; select: Record<string, boolean> };
type FindComments = { where: Record<string, unknown>; orderBy: unknown; take: number; select: Record<string, boolean> };

const review: Review = { id: "newsletter-october", title: "October newsletter", round: 3, status: "open" };
const content: Content = { kind: "paste", snapshotHtml: "<p>Before revision</p>", pastedHtml: "<p>After revision</p>" };
const require = createRequire(import.meta.url);
const compiled = ts.transpileModule(readFileSync(new URL("../../src/app/api/public/page-review/[token]/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function harness(options: { review?: Review | null; content?: Content | null; versions?: { round: number; html: string }[] } = {}) {
  const selectedReview = options.review === undefined ? review : options.review;
  const selectedContent = options.content === undefined ? content : options.content;
  const reads = { metadata: 0, content: 0, comments: 0, credentials: 0 };
  const comments = [
    { id: "earlier-resolved", parentId: null, round: 1, status: "resolved", body: "Already addressed", authorUserId: "other-private-id" },
    { id: "earlier-open", parentId: null, round: 2, status: "open", body: "Still outstanding", authorUserId: "viewer-private-id" },
    { id: "earlier-wontfix", parentId: null, round: 2, status: "wontfix", body: "Not proceeding", authorUserId: "other-private-id" },
    { id: "current", parentId: null, round: 3, status: "open", body: "Current request", authorUserId: "viewer-private-id" },
    { id: "later-reply", parentId: "earlier-resolved", round: 3, status: "open", body: "Reply to earlier round", authorUserId: "other-private-id" },
  ];
  const mocks: Record<string, unknown> = {
    "@/lib/page-review/limits": limits,
    "@/lib/page-review/viewer": {
      verifyPageReviewViewerToken: async (credential: string, reviewId: string) => {
        reads.credentials++;
        assert.equal(reviewId, review.id);
        return credential === "valid-review-credential"
          ? { userId: "viewer-private-id", name: "Reviewer", kind: "user" }
          : null;
      },
    },
    "@/lib/prisma": { prisma: {
      pageReviewVersion: { findMany: async ({ where, select }: any) => {
        assert.equal(where.reviewId, selectedReview!.id);
        return (options.versions ?? []).filter((version) => !where.round || where.round.in.includes(version.round)).map((version) => select.html ? version : { round: version.round });
      } },
      pageReview: { findUnique: async (query: FindReview) => {
        if (query.where.shareToken) {
          reads.metadata++;
          assert.deepEqual(query.where, { shareToken: "shared-token" });
          assert.deepEqual(query.select, { id: true, title: true, round: true, status: true });
          return selectedReview;
        }
        reads.content++;
        assert.deepEqual(query.where, { id: selectedReview!.id, round: selectedReview!.round, status: selectedReview!.status });
        assert.deepEqual(query.select, { kind: true, snapshotHtml: true, pastedHtml: true });
        return selectedContent;
      } },
      pageComment: { findMany: async (query: FindComments) => {
        reads.comments++;
        assert.deepEqual(query.where, { reviewId: review.id }, "history must include resolved and declined earlier rounds");
        assert.deepEqual(query.orderBy, { createdAt: "asc" });
        assert.equal(query.take, limits.PAGE_REVIEW_COMMENT_LIMIT);
        assert.equal(query.select.authorUserId, true);
        return comments;
      } },
    } },
  };
  const exports: { GET?: (request: NextRequest, context: { params: Promise<{ token: string }> }) => Promise<Response> } = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const get = (query = "", credential: string | null = "valid-review-credential") => exports.GET!(new NextRequest(
    `https://review.test/api/public/page-review/shared-token${query}`,
    { headers: credential ? { Authorization: `Bearer ${credential}` } : {} },
  ), { params: Promise.resolve({ token: "shared-token" }) });
  return { get, reads, comments };
}

test("normal polling returns all review rounds without loading HTML or leaking author IDs", async () => {
  for (const query of ["", "?comparison=0"]) {
    const fixture = harness();
    const response = await fixture.get(query);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const result = await response.json();
    assert.deepEqual(result.comments.map((comment: { id: string }) => comment.id), fixture.comments.map((comment) => comment.id));
    assert.equal(result.comments[0].isMine, false);
    assert.equal(result.comments[1].isMine, true);
    assert.deepEqual(result.review, { title: review.title, round: 3, status: "open" });
    assert.equal(fixture.reads.content, 0);
    assert.equal(fixture.reads.comments, 1);
    assert.doesNotMatch(JSON.stringify(result), /authorUserId|other-private-id|snapshotHtml|pastedHtml|beforeHtml|afterHtml|Before revision|After revision/);
  }
});

test("comparison requests require an active review and its signed reviewer credential before loading content", async () => {
  for (const scenario of [
    { review: null, credential: "valid-review-credential", status: 404 },
    { review: { ...review, status: "closed" }, credential: "valid-review-credential", status: 409 },
    { review, credential: null, status: 401 },
    { review, credential: "credential-for-another-review", status: 401 },
  ]) {
    for (const query of ["", "?comparison=1"]) {
      const fixture = harness({ review: scenario.review });
      const response = await fixture.get(query, scenario.credential);
      assert.equal(response.status, scenario.status);
      const result = await response.json();
      assert.deepEqual(Object.keys(result), ["error"]);
      assert.equal(fixture.reads.content, 0);
      assert.equal(fixture.reads.comments, 0);
      assert.doesNotMatch(JSON.stringify(result), /Before revision|After revision|private-id|shared-token/);
    }
  }
});

test("comparison returns only the two HTML snapshots and public review metadata", async () => {
  for (const status of ["open", "exported"]) {
    const fixture = harness({ review: { ...review, status } });
    const response = await fixture.get("?comparison=1");
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Cache-Control"), "private, no-store");
    const result = await response.json();
    assert.deepEqual(result, {
      ok: true,
      review: { title: review.title, round: review.round, status },
      comparison: { beforeHtml: content.snapshotHtml, afterHtml: content.pastedHtml,
        versions: [{ round: 2, html: content.snapshotHtml }, { round: 3, html: content.pastedHtml }], availableRounds: [2, 3] },
    });
    assert.equal(fixture.reads.content, 1);
    assert.equal(fixture.reads.comments, 0);
    assert.doesNotMatch(JSON.stringify(result), /viewer-private-id|shared-token|valid-review-credential|authorUserId|shareToken/);
  }
});

test("any two, three or four saved rounds can be compared without disclosing unselected HTML", async () => {
  for (const chosen of [[1, 5], [1, 3, 5], [1, 2, 3, 5]]) {
    const fixture = harness({ review: { ...review, round: 5 }, versions: [1, 2, 3, 4].map((round) => ({ round, html: `Saved round ${round}` })) });
    const response = await fixture.get(`?comparison=1&rounds=${chosen.join(",")}`);
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.deepEqual(result.comparison.availableRounds, [1, 2, 3, 4, 5]);
    assert.deepEqual(result.comparison.versions.map((version: any) => version.round), chosen);
    assert.doesNotMatch(JSON.stringify(result), /Saved round 4/);
  }
});

test("comparison rejects invalid, duplicate, future, unavailable or excessive round selections", async () => {
  for (const selected of ["1", "1,1", "0,2", "2,4", "1,2,3,4,5", "2,no", "2,2.5", "1,3"]) {
    const fixture = harness();
    assert.equal((await fixture.get(`?comparison=1&rounds=${selected}`)).status, 400, selected);
  }
});

test("comparison is null for round one, live pages, or missing or empty snapshots", async () => {
  const scenarios = [
    { review: { ...review, round: 1 } },
    { content: { ...content, kind: "url" } },
    ...[null, "", " \n\t"].flatMap((empty) => [
      { content: { ...content, snapshotHtml: empty } },
      { content: { ...content, pastedHtml: empty } },
    ]),
  ];
  for (const scenario of scenarios) {
    const fixture = harness(scenario);
    const response = await fixture.get("?comparison=1");
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.comparison, null);
    assert.equal(fixture.reads.comments, 0);
    assert.doesNotMatch(JSON.stringify(result), /Before revision|After revision|private-id|shared-token/);
  }
});

test("a revision or closure between metadata and snapshot reads returns no comparison", async () => {
  // The guarded content lookup no longer matches after either field changes.
  const fixture = harness({ content: null });
  const response = await fixture.get("?comparison=1");
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.deepEqual(result, {
    ok: true,
    review: { title: review.title, round: review.round, status: review.status },
    comparison: null,
  });
  assert.deepEqual(fixture.reads, { metadata: 1, content: 1, comments: 0, credentials: 1 });
  assert.doesNotMatch(JSON.stringify(result), /Before revision|After revision|beforeHtml|afterHtml/);
});
