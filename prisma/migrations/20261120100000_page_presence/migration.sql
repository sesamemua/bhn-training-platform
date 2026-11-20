-- CreateTable
CREATE TABLE "PagePresence" (
    "id" TEXT NOT NULL,
    "pageKey" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Someone',
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "frame" TEXT,
    "field" TEXT,
    "fieldIndex" INTEGER,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PagePresence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PagePresence_pageKey_lastSeenAt_idx" ON "PagePresence"("pageKey", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "PagePresence_pageKey_userId_key" ON "PagePresence"("pageKey", "userId");

