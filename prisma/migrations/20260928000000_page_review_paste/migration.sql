-- Reviewing pasted markup with the same machinery as a live page.
-- Additive: two nullable/defaulted columns, existing rows unaffected
-- (they are all kind = 'url', which is the default).
ALTER TABLE "PageReview" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'url';
ALTER TABLE "PageReview" ADD COLUMN "pastedHtml" TEXT;
