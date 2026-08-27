-- Public VentureConnect applications: no platform account required.
-- userId becomes nullable so a public application can live in the same
-- table, and therefore the same admin queue, as an account-holder's.
-- Existing rows keep their userId; nothing is dropped.
ALTER TABLE "EquipApplication" ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "EquipApplication" ADD COLUMN "applicantName" TEXT;
ALTER TABLE "EquipApplication" ADD COLUMN "applicantEmail" TEXT;
ALTER TABLE "EquipApplication" ADD COLUMN "publicToken" TEXT;

CREATE UNIQUE INDEX "EquipApplication_publicToken_key" ON "EquipApplication"("publicToken");
