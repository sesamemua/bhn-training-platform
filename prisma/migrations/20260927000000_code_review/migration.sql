-- A tab for reviewing pasted code. Purely additive: two new tables.
CREATE TABLE "CodeReview" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'html',
    "code" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CodeReviewNote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 1,
    "anchorText" TEXT NOT NULL,
    "anchorLine" INTEGER NOT NULL,
    "anchorBefore" TEXT,
    "anchorAfter" TEXT,
    "anchorState" TEXT NOT NULL DEFAULT 'exact',
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "authorId" TEXT,
    "authorName" TEXT NOT NULL DEFAULT 'Someone',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CodeReviewNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CodeReview_status_updatedAt_idx" ON "CodeReview"("status", "updatedAt");
CREATE INDEX "CodeReviewNote_reviewId_status_idx" ON "CodeReviewNote"("reviewId", "status");

ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CodeReviewNote" ADD CONSTRAINT "CodeReviewNote_reviewId_fkey"
    FOREIGN KEY ("reviewId") REFERENCES "CodeReview"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodeReviewNote" ADD CONSTRAINT "CodeReviewNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
