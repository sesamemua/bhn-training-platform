CREATE EXTENSION IF NOT EXISTS vector;

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "thumbKey" TEXT,
    "fileName" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sha256" TEXT NOT NULL,
    "color" TEXT,
    "blur" TEXT,
    "folder" TEXT NOT NULL DEFAULT 'General',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "caption" TEXT,
    "altText" TEXT,
    "aiTagged" BOOLEAN NOT NULL DEFAULT false,
    "people" TEXT,
    "consent" TEXT NOT NULL DEFAULT 'unknown',
    "credit" TEXT,
    "license" TEXT,
    "source" TEXT,
    "expiresAt" TIMESTAMP(3),
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "uploadedById" TEXT,
    "uploadedByName" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "embedding" vector(384),

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetVersion" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "thumbKey" TEXT,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetUsage" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "href" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetCollection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "shareToken" TEXT,
    "shareExpiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Asset_deletedAt_createdAt_idx" ON "Asset"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "Asset_sha256_idx" ON "Asset"("sha256");

-- CreateIndex
CREATE INDEX "Asset_folder_idx" ON "Asset"("folder");

-- CreateIndex
CREATE INDEX "AssetVersion_assetId_version_idx" ON "AssetVersion"("assetId", "version");

-- CreateIndex
CREATE INDEX "AssetUsage_targetType_targetId_idx" ON "AssetUsage"("targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetUsage_assetId_targetType_targetId_key" ON "AssetUsage"("assetId", "targetType", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "AssetCollection_shareToken_key" ON "AssetCollection"("shareToken");

-- AddForeignKey
ALTER TABLE "AssetVersion" ADD CONSTRAINT "AssetVersion_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetUsage" ADD CONSTRAINT "AssetUsage_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

