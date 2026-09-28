ALTER TABLE "SocialPost"
ADD COLUMN "trackChanges" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "editVersion" INTEGER NOT NULL DEFAULT 0;

UPDATE "SocialPost"
SET "body" = replace("body", 'https://luma.com/wh30nh1n', 'https://biohubnet.ca/2026-annual-symposium'),
    "status" = 'draft',
    "approvedAt" = NULL,
    "approvedById" = NULL,
    "editVersion" = "editVersion" + 1,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "stream" = 'symposium_2026'
  AND "status" IN ('draft', 'approved', 'scheduled')
  AND "body" LIKE '%https://luma.com/wh30nh1n%';
