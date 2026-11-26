CREATE TABLE "PageReviewTextCheckpoint" (
    "reviewId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "target" TEXT NOT NULL,
    "baseline" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "etag" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PageReviewTextCheckpoint_pkey" PRIMARY KEY ("reviewId", "owner"),
    CONSTRAINT "PageReviewTextCheckpoint_reviewId_fkey"
      FOREIGN KEY ("reviewId") REFERENCES "PageReview"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PageReviewTextCheckpoint_owner_fkey"
      FOREIGN KEY ("owner") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PageReviewTextCheckpoint_owner_idx" ON "PageReviewTextCheckpoint"("owner");
