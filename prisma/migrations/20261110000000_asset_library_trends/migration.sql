-- AlterTable
ALTER TABLE "Asset" ADD COLUMN     "downloads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "durationSec" DOUBLE PRECISION,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'image',
ADD COLUMN     "origin" TEXT NOT NULL DEFAULT 'unknown',
ADD COLUMN     "phash" TEXT,
ADD COLUMN     "provenance" JSONB,
ADD COLUMN     "transcript" TEXT;

-- AlterTable
ALTER TABLE "AssetCollection" ADD COLUMN     "query" JSONB,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "Asset_phash_idx" ON "Asset"("phash");

