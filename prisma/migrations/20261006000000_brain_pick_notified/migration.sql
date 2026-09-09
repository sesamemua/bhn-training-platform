-- When the email for an ask actually went out.
--
-- NULL means nobody has been emailed about this request — which is the
-- state every ask is created in. Nothing sends on create; a person has
-- to click send, and this column is what proves it happened and stops a
-- second click emailing somebody twice.
ALTER TABLE "BrainPick" ADD COLUMN "notifiedAt" TIMESTAMP(3);
CREATE INDEX "BrainPick_askedById_notifiedAt_idx" ON "BrainPick"("askedById", "notifiedAt");
