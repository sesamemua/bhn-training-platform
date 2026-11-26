import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { createPageReviewViewerToken } from "../../src/lib/page-review/viewer";

/** Opt-in integration against a disposable local database and the actual Next.js server. */
async function main() {
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.pathname, "/bhn_shared_review_pilot");
  assert(["localhost", "127.0.0.1"].includes(database.hostname));
  const origin = "http://localhost:3207", id = "newsletter-live-fixture", token = "local-newsletter-fixture";
  const prisma = new PrismaClient();
  const browser = await chromium.launch();
  try {
    await prisma.pageReview.deleteMany({ where: { id } });
    await prisma.$executeRaw`DELETE FROM "ReviewFeedbackMemory" WHERE "reviewId"=${id}`;
    await prisma.user.upsert({ where: { id: "fixture-colleague" }, create: { id: "fixture-colleague", name: "Fixture colleague", email: "local-reviewer@example.test", role: "instructor" }, update: { role: "instructor", isActive: true } });
    await prisma.newsletterIssue.upsert({ where: { id: "live-fixture" }, create: { id: "live-fixture", title: "Local newsletter pilot", dateline: "November", status: "generated" }, update: { status: "generated" } });
    const html = '<!doctype html><html><head><meta charset="utf-8"><title>Local newsletter pilot</title></head><body><h1>Newsletter pilot</h1><h2>One</h2><p data-nl-piece="one" data-nl-part="CTA"><a href="/one">Register</a></p><h2>Two</h2><p data-nl-piece="two" data-nl-part="CTA"><a href="/two">Register</a></p></body></html>';
    await prisma.pageReview.create({ data: { id, shareToken: token, title: "Local newsletter pilot",
      url: "/review-paste/" + token, kind: "paste", round: 4, pastedHtml: html } });
    const viewer = await createPageReviewViewerToken({ reviewId: id, userId: "fixture-colleague", name: "Fixture colleague" });
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      return url.origin === origin || url.protocol === "data:" ? route.continue() : route.abort();
    });
    await page.goto(origin + "/review-paste/" + token + "#bhn-review=" + token + "&bhn-reviewer=" + encodeURIComponent(viewer));
    await expect(page.getByRole("button", { name: "Comment on an element", exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('script[data-round="4"]')).toHaveCount(1);
    await page.locator('[data-nl-piece="two"] a').hover();
    await page.getByRole("button", { name: "Comment on selected newsletter element" }).click();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Actual route feedback");
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.getByText("Actual route feedback", { exact: true })).toBeVisible();
    const comment = await prisma.pageComment.findFirstOrThrow({ where: { reviewId: id } });
    assert.equal(comment.round, 4);
    assert.equal(comment.authorName, "Fixture colleague");
    assert.match(comment.anchorKey!, /two/);
    const evidence = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM "ReviewFeedbackMemory" WHERE "reviewId"=${id}`;
    assert.equal(Number(evidence[0].count), 1);
    await page.getByRole("button", { name: "Resolve", exact: true }).click();
    await expect(page.getByRole("button", { name: "Reopen", exact: true })).toBeVisible();
    assert.equal((await prisma.pageComment.findUniqueOrThrow({ where: { id: comment.id } })).status, "resolved");
    const dock = page.getByRole("complementary", { name: "Review actions" });
    await expect(dock.getByRole("button", { name: "Copy comments", exact: true })).toBeVisible();
    assert.equal(await page.locator("#bhn-review-overlay .bhn-rv-copy-readonly").count(), 0);
    await page.locator('[data-nl-piece="two"] a [contenteditable]').click();
    await expect(page).toHaveURL(/review-paste\/local-newsletter-fixture/);
    await page.getByRole("textbox", { name: "Edit newsletter text: Newsletter pilot", exact: true }).fill("Newsletter pilot corrected");
    await dock.getByRole("button", { name: "Save revision", exact: true }).click();
    await expect(page.locator(".bhn-rv-meta")).toContainText("Round 5");
    await expect(page.locator("h1")).toHaveText("Newsletter pilot corrected");
    assert.match((await prisma.newsletterIssue.findUniqueOrThrow({ where: { id: "live-fixture" } })).renderedHtml!, /Newsletter pilot corrected/);
    assert.equal(await prisma.pageReviewVersion.count({ where: { reviewId: id, round: 4 } }), 1);
    assert.equal(await prisma.auditLog.count({ where: { targetId: id, action: "newsletter.review.text-edit" } }), 1);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(dock.getByText("Text editing ready", { exact: true })).toBeVisible();
    const position = await dock.boundingBox();
    assert.ok(position && position.x <= 15 && position.x + position.width <= 380);
    const panel = await page.locator("#bhn-review-overlay").boundingBox();
    assert.ok(panel && panel.y + panel.height < position.y, "side tools and comment panel must not overlap on mobile");
    await page.screenshot({ path: "/private/tmp/newsletter-inline-editor-mobile.png", fullPage: true });
    await page.getByRole("button", { name: "General comment", exact: true }).click();
    await page.getByRole("textbox", { name: "New review comment" }).fill("Retain my unsaved feedback");
    await prisma.pageReview.update({ where: { id }, data: { round: 6 } });
    await page.getByRole("button", { name: "Add comment", exact: true }).click();
    await expect(page.getByText(/This review changed/)).toBeVisible();
    assert.equal(await prisma.pageComment.count({ where: { reviewId: id } }), 1);
    assert.deepEqual(errors, []);
    console.log("PASS: actual Next.js comments and inline text edits, separate lower-left tools, archived version, saved export, editor audit and stale-round rejection.");
  } finally {
    await browser.close();
    await prisma.pageReview.deleteMany({ where: { id } });
    await prisma.$executeRaw`DELETE FROM "ReviewFeedbackMemory" WHERE "reviewId"=${id}`;
    await prisma.newsletterIssue.deleteMany({ where: { id: "live-fixture" } });
    await prisma.user.deleteMany({ where: { id: "fixture-colleague" } });
    await prisma.$disconnect();
  }
}
void main();
