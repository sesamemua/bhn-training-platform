import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = ts.transpileModule(readFileSync("src/lib/newsletter/active-review-issue.ts", "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test("Review chooses the newest open saved unsent review, not the new Compose issue", async () => {
  const api = {} as { activeNewsletterReviewIssue(): Promise<string | null> };
  let reviews = [{ id: "newsletter-sent" }, { id: "newsletter-november" }, { id: "newsletter-october" }];
  let issues = [{ id: "october" }, { id: "november" }];
  new Function("require", "exports", source)((path: string) => {
    assert.equal(path, "@/lib/prisma");
    return { prisma: {
      pageReview: { findMany: async (query: { where: unknown; orderBy: unknown }) => {
        assert.deepEqual(query.where, { id: { startsWith: "newsletter-" }, kind: "paste", status: "open", pastedHtml: { not: "" } });
        assert.deepEqual(query.orderBy, [{ updatedAt: "desc" }, { id: "asc" }]);
        return reviews;
      } },
      newsletterIssue: { findMany: async (query: { where: unknown }) => {
        assert.deepEqual(query.where, { id: { in: ["sent", "november", "october"] }, status: { not: "sent" } });
        return issues;
      } },
    } };
  }, api);
  assert.equal(await api.activeNewsletterReviewIssue(), "november");
  issues = [{ id: "october" }];
  assert.equal(await api.activeNewsletterReviewIssue(), "october");
  issues = [];
  assert.equal(await api.activeNewsletterReviewIssue(), null);
  reviews = [];
  assert.equal(await api.activeNewsletterReviewIssue(), null);
});
