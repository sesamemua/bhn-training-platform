-- Eligibility roster for Training Week registration.
-- Purely additive: two new tables, no changes to existing rows.
CREATE TABLE "EligibilityImport" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "filename" TEXT,
    "rowsRead" INTEGER NOT NULL DEFAULT 0,
    "rowsAccepted" INTEGER NOT NULL DEFAULT 0,
    "rowsSkipped" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "byId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EligibilityImport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EligibilityEntry" (
    "id" TEXT NOT NULL,
    "emailKey" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "sourceId" TEXT NOT NULL,
    "note" TEXT,
    "importId" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EligibilityEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EligibilityImport_sourceId_createdAt_idx" ON "EligibilityImport"("sourceId", "createdAt");
CREATE UNIQUE INDEX "EligibilityEntry_emailKey_sourceId_key" ON "EligibilityEntry"("emailKey", "sourceId");
CREATE INDEX "EligibilityEntry_emailKey_idx" ON "EligibilityEntry"("emailKey");
CREATE INDEX "EligibilityEntry_sourceId_idx" ON "EligibilityEntry"("sourceId");

ALTER TABLE "EligibilityImport" ADD CONSTRAINT "EligibilityImport_byId_fkey"
    FOREIGN KEY ("byId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EligibilityEntry" ADD CONSTRAINT "EligibilityEntry_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "EligibilityEntry" ADD CONSTRAINT "EligibilityEntry_importId_fkey"
    FOREIGN KEY ("importId") REFERENCES "EligibilityImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
