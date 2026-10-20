CREATE TABLE "PageReviewVersion" (
  "reviewId" TEXT NOT NULL,
  "round" INTEGER NOT NULL,
  "html" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PageReviewVersion_pkey" PRIMARY KEY ("reviewId", "round"),
  CONSTRAINT "PageReviewVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PageReview"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Only the immediately preceding version was retained by the old review system.
INSERT INTO "PageReviewVersion" ("reviewId", "round", "html", "createdAt")
SELECT "id", "round" - 1, "snapshotHtml", COALESCE("snapshotAt", "updatedAt")
FROM "PageReview"
WHERE "kind" = 'paste' AND "round" > 1 AND length(trim("snapshotHtml")) > 0;
