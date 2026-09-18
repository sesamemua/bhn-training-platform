-- Call sheets belong to a video project: each project has its own
-- Scripts, Call sheets and Production cost tabs.
ALTER TABLE "CallSheet" ADD COLUMN "projectId" TEXT;

ALTER TABLE "CallSheet" ADD CONSTRAINT "CallSheet_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "VideoProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "CallSheet_projectId_shootDate_idx" ON "CallSheet"("projectId", "shootDate");

-- The existing sheets are all for the BHN Promo Video shoot.
UPDATE "CallSheet" c SET "projectId" = p."id"
FROM "VideoProject" p
WHERE c."projectId" IS NULL AND p."title" = 'BHN Promo Video Project';
