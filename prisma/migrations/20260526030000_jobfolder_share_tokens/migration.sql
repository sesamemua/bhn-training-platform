-- ── Fresh-database guard (added Aug 2026) ────────────────────────
-- Backdated migration: it alters/references "JobFolder", which is only
-- CREATED by a later-named migration — on production the table already
-- existed (created during development, formalised later), so this
-- applied fine; on a brand-new database the name-order replay dies here.
-- On a fresh database we skip the whole file and the tail migration
-- 20260916000000_fresh_replay_repairs recreates every skipped object
-- once its dependencies exist. Idempotent both ways.
DO $fresh_db_guard$
BEGIN
  IF to_regclass('"JobFolder"') IS NULL THEN
    RETURN;
  END IF;

-- Tokenised read-only share links for JobFolder.
-- /share/folder/[token] serves a no-login mentor-friendly view.

CREATE TABLE "JobFolderShareToken" (
    "id"        TEXT         NOT NULL,
    "folderId"  TEXT         NOT NULL,
    "token"     TEXT         NOT NULL,
    "label"     TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "JobFolderShareToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobFolderShareToken_token_key"
    ON "JobFolderShareToken" ("token");

CREATE INDEX "JobFolderShareToken_folderId_createdAt_idx"
    ON "JobFolderShareToken" ("folderId", "createdAt");

ALTER TABLE "JobFolderShareToken"
    ADD CONSTRAINT "JobFolderShareToken_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "JobFolder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
END
$fresh_db_guard$;
