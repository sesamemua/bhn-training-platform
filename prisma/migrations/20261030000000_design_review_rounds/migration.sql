-- Design review: rounds that lock when the feedback is copied, and "asked to review".
ALTER TABLE "DesignArtwork" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DesignArtwork" ADD COLUMN "lockedAt" TIMESTAMP(3);
ALTER TABLE "DesignPin" ADD COLUMN "round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "DesignReview" ADD COLUMN "requestedAt" TIMESTAMP(3);
ALTER TABLE "DesignReview" ADD COLUMN "requestedByName" TEXT;
