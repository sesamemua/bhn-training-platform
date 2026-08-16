-- Fresh-replay repairs.
--
-- Several 2026-05 migrations were written after the tables they touch and
-- backdated, so the chain only ever worked on databases where those tables
-- already existed (i.e. production). Standing up the portfolio-demo
-- database surfaced it: a fresh replay died four times. Those migrations
-- now carry fresh-database guards that skip them when their dependencies
-- are missing, and THIS migration recreates everything the guards skip —
-- after every dependency exists.
--
-- Every statement is idempotent (IF NOT EXISTS / pg_constraint checks), so
-- on production — where all of these objects already exist — this whole
-- file is a no-op.
--
-- Known and deliberately NOT repaired here: the chain↔schema drift that
-- predates this work (DROP DEFAULT churn on updatedAt/array columns, and
-- ~24 foreign keys whose referential actions differ from the schema's
-- declarations). Production has the same drift; aligning it is a real
-- behavioural change and belongs in its own reviewed migration, not in a
-- demo-enablement repair.

-- JobFolder columns skipped by the guard on 20260526010000/20260526020000.
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "applicationUrl" TEXT;
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "appliedAt" TIMESTAMP(3);
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "deadline" TIMESTAMP(3);
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "recruiterEmail" TEXT;
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "recruiterName" TEXT;
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "referredBy" TEXT;
ALTER TABLE "JobFolder" ADD COLUMN IF NOT EXISTS "simulationRequestId" TEXT;

CREATE TABLE IF NOT EXISTS "JobFolderEvent" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFolderEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "JobFolderShareToken" (
    "id" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobFolderShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "JobFolderShareToken_token_key" ON "JobFolderShareToken"("token");
CREATE INDEX IF NOT EXISTS "JobFolderShareToken_folderId_createdAt_idx" ON "JobFolderShareToken"("folderId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobFolderEvent_folderId_createdAt_idx" ON "JobFolderEvent"("folderId", "createdAt");
CREATE INDEX IF NOT EXISTS "JobFolder_simulationRequestId_idx" ON "JobFolder"("simulationRequestId");
CREATE INDEX IF NOT EXISTS "JobFolder_userId_deadline_idx" ON "JobFolder"("userId", "deadline");

DO $repair$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SimulationRequest_simulationId_fkey') THEN
    ALTER TABLE "SimulationRequest" ADD CONSTRAINT "SimulationRequest_simulationId_fkey" FOREIGN KEY ("simulationId") REFERENCES "Simulation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$repair$;

DO $repair$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobFolder_simulationRequestId_fkey') THEN
    ALTER TABLE "JobFolder" ADD CONSTRAINT "JobFolder_simulationRequestId_fkey" FOREIGN KEY ("simulationRequestId") REFERENCES "SimulationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$repair$;

DO $repair$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobFolderShareToken_folderId_fkey') THEN
    ALTER TABLE "JobFolderShareToken" ADD CONSTRAINT "JobFolderShareToken_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "JobFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$repair$;

DO $repair$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'JobFolderEvent_folderId_fkey') THEN
    ALTER TABLE "JobFolderEvent" ADD CONSTRAINT "JobFolderEvent_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "JobFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$repair$;
