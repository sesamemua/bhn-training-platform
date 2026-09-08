-- Routine social posts, generated from the platform's own facts.
--
-- `key` is stream:kind:deadlineId:daysBefore and is unique, because the
-- daily job must never produce a second copy of a post somebody has
-- already edited.

CREATE TABLE "SocialPost" (
    "id"           TEXT NOT NULL,
    "stream"       TEXT NOT NULL,
    "kind"         TEXT NOT NULL,
    "deadlineId"   TEXT NOT NULL,
    "daysBefore"   INTEGER NOT NULL DEFAULT 0,
    "key"          TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'draft',
    "body"         TEXT NOT NULL,
    "assetSpec"    JSONB NOT NULL,
    "assetUrl"     TEXT,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "approvedAt"   TIMESTAMP(3),
    "approvedById" TEXT,
    "publishedAt"  TIMESTAMP(3),
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SocialPost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SocialPost_key_key" ON "SocialPost"("key");
CREATE INDEX "SocialPost_status_scheduledFor_idx" ON "SocialPost"("status", "scheduledFor");
CREATE INDEX "SocialPost_deadlineId_idx" ON "SocialPost"("deadlineId");

ALTER TABLE "SocialPost"
    ADD CONSTRAINT "SocialPost_approvedById_fkey"
    FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- May we name this applicant publicly when announcing who was funded?
-- False is the honest default: nobody has been asked yet, so a
-- recipients post is short rather than wrong.
ALTER TABLE "EquipApplication"
    ADD COLUMN "publicityConsent" BOOLEAN NOT NULL DEFAULT false;
