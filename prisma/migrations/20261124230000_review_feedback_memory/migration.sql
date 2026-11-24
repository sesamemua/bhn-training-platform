CREATE TABLE "ReviewFeedbackMemory" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detail" TEXT NOT NULL,
    CONSTRAINT "ReviewFeedbackMemory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReviewFeedbackMemory_reviewId_recordedAt_idx" ON "ReviewFeedbackMemory"("reviewId", "recordedAt");
CREATE INDEX "ReviewFeedbackMemory_recordedAt_idx" ON "ReviewFeedbackMemory"("recordedAt");
