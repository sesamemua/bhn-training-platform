import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";

type Issue = { renderedHtml: string | null };
type Review = { round: number; pastedHtml: string | null; snapshotHtml: string | null; status: string };
type Context = { params: Promise<{ id: string }> };
type Route = { GET: (request: Request, context: Context) => Promise<Response> };
const routePath = "src/app/api/workspace/newsletter/[id]/review-preview/route.ts";
const compiled = ts.transpileModule(readFileSync(routePath, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;

function harness(options: {
  authorized?: boolean; authThrows?: boolean;
  issue?: Issue | null; review?: Review | null; versions?: Record<number, string>;
} = {}) {
  const require = createRequire(import.meta.url);
  const issue = options.issue === undefined ? { renderedHtml: "<p>Compose differs from saved review</p>" } : options.issue;
  const review = options.review === undefined ? { round: 4, pastedHtml: "<p>Saved current draft</p>", snapshotHtml: "<p>Fallback round three</p>", status: "pending" } : options.review;
  const reads = { issue: 0, review: 0, version: [] as number[] };
  const writes: string[] = [];
  const denyWrite = (action: string) => async () => { writes.push(action); throw new Error("Preview must never write"); };
  const noWrites = { create: denyWrite("create"), update: denyWrite("update"), updateMany: denyWrite("updateMany"), upsert: denyWrite("upsert"), delete: denyWrite("delete") };
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => {
      assert.equal(role, "instructor");
      if (options.authThrows) throw new Error("No session");
      return options.authorized === false ? null : { user: { id: "staff", role: "instructor" } };
    } },
    "@/lib/prisma": { prisma: {
      newsletterIssue: { ...noWrites, findUnique: async (query: unknown) => {
        reads.issue++;
        assert.deepEqual(query, { where: { id: "issue-1" }, select: { renderedHtml: true } });
        return issue;
      } },
      pageReview: { ...noWrites, findUnique: async (query: unknown) => {
        reads.review++;
        assert.deepEqual(query, { where: { id: "newsletter-issue-1" }, select: { round: true, pastedHtml: true, snapshotHtml: true } });
        return review;
      } },
      pageReviewVersion: { ...noWrites, findUnique: async (query: { where: { reviewId_round: { reviewId: string; round: number } }; select: unknown }) => {
        assert.equal(query.where.reviewId_round.reviewId, "newsletter-issue-1");
        assert.deepEqual(query.select, { html: true });
        const round = query.where.reviewId_round.round;
        reads.version.push(round);
        return options.versions?.[round] === undefined ? null : { html: options.versions[round] };
      } },
      $transaction: denyWrite("transaction"),
    } },
  };
  const exports: Partial<Route> & Record<string, unknown> = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  return {
    issue, review, reads, writes, exports,
    get: (query = "") => exports.GET!(new Request(`https://bhn.example/api/workspace/newsletter/issue-1/review-preview${query}`), { params: Promise.resolve({ id: "issue-1" }) }),
  };
}

function assertPrivate(response: Response) {
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Robots-Tag"), "noindex, nofollow");
  assert.equal(response.headers.get("Referrer-Policy"), "no-referrer");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), null);
  const csp = response.headers.get("Content-Security-Policy")!;
  assert.match(csp, /^sandbox(?:;|$)/);
  assert.match(csp, /script-src 'none'/);
  assert.match(csp, /form-action 'none'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'self'/);
  assert.doesNotMatch(csp, /allow-scripts|allow-same-origin|allow-forms|allow-popups/);
}

test("preview requires staff authentication before any content read and never exposes share-token access", async () => {
  for (const options of [{ authorized: false }, { authThrows: true }]) {
    const h = harness(options);
    for (const query of ["", "?round=2", "?thumbnail=1", "?shareToken=known-token"]) {
      const response = await h.get(query);
      assert.equal(response.status, 403);
      assertPrivate(response);
      assert.doesNotMatch(await response.text(), /Saved|Compose|current draft|known-token/);
    }
    assert.deepEqual(h.reads, { issue: 0, review: 0, version: [] });
    assert.deepEqual(h.writes, []);
  }
});

test("missing issues return 404 without querying a review or exposing content", async () => {
  const h = harness({ issue: null });
  const response = await h.get();
  assert.equal(response.status, 404);
  assertPrivate(response);
  assert.equal(h.reads.review, 0);
  assert.deepEqual(h.reads.version, []);
  assert.deepEqual(h.writes, []);
});

test("default preview prefers exact saved review HTML and never releases or advances any state", async () => {
  for (const status of ["pending", "open", "exported", "closed"]) {
    const h = harness({ review: { round: 4, status, pastedHtml: " \n<!doctype html><html><body><p>Saved &amp; exact</p></body></html>\n ", snapshotHtml: "older" } });
    const before = structuredClone({ review: h.review, issue: h.issue });
    for (const query of ["", "?thumbnail=1"]) {
      const response = await h.get(query);
      assert.equal(response.status, 200);
      assertPrivate(response);
      assert.equal(response.headers.get("Content-Type"), "text/html; charset=utf-8");
      assert.equal(await response.text(), h.review!.pastedHtml);
    }
    assert.deepEqual({ review: h.review, issue: h.issue }, before);
    assert.deepEqual(h.writes, []);
    assert.deepEqual(h.reads.version, []);
    assert.equal(h.exports.POST, undefined);
    assert.equal(h.exports.PATCH, undefined);
    assert.equal(h.exports.DELETE, undefined);
  }
});

test("default can preview saved Compose HTML without a review, but never invents numbered revisions", async () => {
  for (const review of [null, { round: 4, status: "pending", pastedHtml: null, snapshotHtml: null }, { round: 4, status: "pending", pastedHtml: " \n ", snapshotHtml: null }]) {
    const h = harness({ review });
    const response = await h.get();
    assert.equal(response.status, 200);
    assert.equal(await response.text(), h.issue!.renderedHtml);
    assert.equal((await h.get("?round=4")).status, 404);
    assert.deepEqual(h.writes, []);
  }
  for (const html of [null, "", "\n "]) {
    const h = harness({ review: null, issue: { renderedHtml: html } });
    const response = await h.get();
    assert.equal(response.status, 404);
    assertPrivate(response);
  }
});

test("selected current round uses only saved pasted HTML and historical rounds use their scoped archive", async () => {
  const h = harness({ versions: { 1: "<p>First saved round</p>", 3: "<p>Archived third round wins over fallback</p>" } });
  const current = await h.get("?round=4");
  assert.equal(await current.text(), h.review!.pastedHtml);
  assert.deepEqual(h.reads.version, []);
  for (const [round, html] of [[1, "<p>First saved round</p>"], [3, "<p>Archived third round wins over fallback</p>"]] as const) {
    const response = await h.get(`?round=${round}`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assertPrivate(response);
  }
  assert.deepEqual(h.reads.version, [1, 3]);
  assert.deepEqual(h.writes, []);
});

test("snapshot fallback applies only to the immediately previous round; absent and future rounds stay unavailable", async () => {
  const h = harness({ versions: { 3: " ", 5: "future content must never leak" } });
  const previous = await h.get("?round=3");
  assert.equal(previous.status, 200);
  assert.equal(await previous.text(), h.review!.snapshotHtml);
  for (const round of [1, 2, 5, 999]) {
    const response = await h.get(`?round=${round}`);
    assert.equal(response.status, 404);
    assertPrivate(response);
    assert.doesNotMatch(await response.text(), /Fallback|Compose|future content|Saved current/);
  }
  assert.deepEqual(h.reads.version, [3, 1, 2]);
  assert.deepEqual(h.writes, []);
});

test("invalid, ambiguous or unsafe round values fail before reading saved content", async () => {
  for (const query of ["?round=", "?round=0", "?round=-1", "?round=1.2", "?round=1e2", "?round=01", "?round=NaN", "?round=Infinity", "?round=%201%20", "?round=%2B1", "?round=9007199254740992", "?round=1&round=2", "?round=1&round=1"]) {
    const h = harness();
    const response = await h.get(query);
    assert.equal(response.status, 400, query);
    assertPrivate(response);
    assert.deepEqual(h.reads, { issue: 0, review: 0, version: [] });
    assert.deepEqual(h.writes, []);
  }
});

test("saved markup, images and links are not altered; response CSP disables all scripts and forms", async () => {
  const html = '<!DOCTYPE html><html><head><title>Original title</title></head><body><script>window.previewExecuted=true</script><img src="https://images.example/picture.png" alt="A &amp; B"><a href="https://example.com/apply">Apply</a><form action="/api/change"><input name="x"></form><table><tr><td>Saved newsletter</td></tr></table></body></html>';
  const h = harness({ review: { round: 1, status: "pending", pastedHtml: html, snapshotHtml: null } });
  for (const query of ["", "?round=1&thumbnail=1"]) {
    const response = await h.get(query);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), html);
    assertPrivate(response);
  }
  assert.deepEqual(h.writes, []);
});

test("the read-only preview surface is registered in the existing newsletter feedback workflow", () => {
  const registry = JSON.parse(readFileSync("config/review-feedback-sources.json", "utf8"));
  assert.deepEqual(registry.surfaces[routePath], { workflow: "newsletter" });
});
