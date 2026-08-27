-- Re-anchor code-review notes to ELEMENTS rather than lines.
-- The paste is rendered and clicked now, not read as text, so a line
-- number anchors nothing. The table shipped hours ago and holds no
-- rows, so the columns are replaced rather than migrated.
ALTER TABLE "CodeReviewNote" DROP COLUMN "anchorText";
ALTER TABLE "CodeReviewNote" DROP COLUMN "anchorLine";
ALTER TABLE "CodeReviewNote" DROP COLUMN "anchorBefore";
ALTER TABLE "CodeReviewNote" DROP COLUMN "anchorAfter";

ALTER TABLE "CodeReviewNote" ADD COLUMN "anchorQuote" TEXT;
ALTER TABLE "CodeReviewNote" ADD COLUMN "anchorLabel" TEXT;
ALTER TABLE "CodeReviewNote" ADD COLUMN "cssPath" TEXT;

ALTER TABLE "CodeReviewNote" ALTER COLUMN "anchorState" SET DEFAULT 'found';
