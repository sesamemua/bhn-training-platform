import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildBrief } from "../../src/lib/page-review/brief";
import { PAGE_REVIEW_COMMENT_LIMIT } from "../../src/lib/page-review/limits";
import { NewsletterPageReview } from "../../src/components/workspace/NewsletterPageReview";

test("copying fetches fresh open newsletter threads, replies and earlier notes without changing the review", async () => {
  let authorized = true, exists = true, reads = 0;
  const base = { round: 7, parentId: null, authorName: "Colleague", authorKind: "user", editedByName: null,
    status: "open", anchorQuote: "Heading on the page", anchorKey: "Headline", anchorPath: ".heading", anchorBlock: null,
    anchorState: "found", createdAt: new Date("2026-10-20T12:00:00Z") };
  const comments = [
    { ...base, id: "thread", body: "Correct the date." },
    { ...base, id: "reply", parentId: "thread", body: "Use October 29.", round: 8 },
    { ...base, id: "resolved", body: "Already addressed", status: "resolved" },
    { ...base, id: "wontfix", body: "Not going ahead", status: "wontfix" },
  ];
  const earlier = [{ id: "earlier", body: "Clarify eligibility.", authorName: "Editor", editedByName: "Reviewer",
    status: "open", anchorQuote: "Eligibility", anchorLabel: "Paragraph", cssPath: ".eligibility", pieceId: "piece", createdAt: base.createdAt }];
  let review: any = { round: 9, status: "open", comments };
  const require = createRequire(import.meta.url);
  const compiled = ts.transpileModule(readFileSync("src/lib/newsletter/review-comments.ts", "utf8"), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const mocks: Record<string, unknown> = {
    "@/lib/auth": { requireRole: async (role: string) => { assert.equal(role, "instructor"); return authorized ? { user: { id: "staff" } } : null; } },
    "@/lib/page-review/brief": { buildBrief },
    "@/lib/page-review/limits": { PAGE_REVIEW_COMMENT_LIMIT },
    "@/lib/prisma": { prisma: {
      newsletterIssue: { findUnique: async ({ where }: any) => { reads++; assert.equal(where.id, "october"); return exists ? { title: "October Newsletter" } : null; } },
      pageReview: { findUnique: async ({ where, select }: any) => { reads++; assert.equal(where.id, "newsletter-october"); assert.equal(select.comments.take, PAGE_REVIEW_COMMENT_LIMIT); return review; } },
      newsletterComment: { findMany: async ({ where }: any) => { reads++; assert.deepEqual(where, { issueId: "october", status: "open" }); return earlier; } },
    } },
  };
  const exports: Record<string, any> = {};
  new Function("require", "exports", compiled)((id: string) => mocks[id] ?? require(id), exports);
  const copy = exports.getNewsletterReviewComments;
  authorized = false;
  assert.equal((await copy("october")).error, "Forbidden");
  assert.equal(reads, 0);
  authorized = true;
  for (const input of [null, {}, "", "x".repeat(151)]) assert.equal((await copy(input)).ok, false);
  assert.equal(reads, 0);
  exists = false;
  assert.equal((await copy("october")).error, "Issue not found.");
  exists = true;
  const result = await copy("october");
  assert.equal(result.ok, true);
  assert.match(result.brief, /\*\*Open items:\*\* 2/);
  assert.match(result.brief, /Correct the date/);
  assert.match(result.brief, /Use October 29/);
  assert.match(result.brief, /Carried over from Round 7/);
  assert.match(result.brief, /Earlier newsletter note: Paragraph/);
  assert.match(result.brief, /Clarify eligibility/);
  assert.match(result.brief, /edited by Reviewer/);
  assert.match(result.brief, /\/newsletter\/review\?issue=october/);
  assert.doesNotMatch(result.brief, /Already addressed|Not going ahead|bhn-reviewer|shareToken/);
  assert.equal(review.round, 9);
  assert.equal(review.status, "open");
  comments[0].body = "Latest correction.";
  review.status = "exported";
  const refreshed = await copy("october");
  assert.match(refreshed.brief, /Latest correction/);
  assert.doesNotMatch(refreshed.brief, /Correct the date/);
  assert.equal(review.status, "exported");
  assert.equal(review.round, 9);
  review = null; earlier.length = 0;
  assert.match((await copy("october")).brief, /No open comments/);
});

test("Copy review comments is available to colleagues, including issues with only earlier notes", () => {
  for (const canEdit of [true, false]) for (const initialReview of [null, { id: "newsletter-october", round: 9, status: "open" }]) {
    const html = renderToStaticMarkup(createElement(NewsletterPageReview, { issueId: "october", html: "", canEdit, initialReview }));
    assert.match(html, /Copy review comments/);
    assert.match(html, /title="Copy open review comments and replies"/);
    assert.doesNotMatch(html, /Review comments to copy|<iframe/);
  }
});
