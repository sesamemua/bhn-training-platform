-- VentureConnect reconciliation: what was actually spent, against what
-- was approved.
--
-- Three nullable columns, so every existing application stays valid and
-- simply reads as "not reconciled yet". Nothing is backfilled: an
-- application approved last year has no actual figure and inventing one
-- (say, copying approvedAmount) would make the variance report say every
-- grant was spent to the dollar, which is the opposite of useful.

ALTER TABLE "EquipApplication"
    ADD COLUMN "actualAmount" DOUBLE PRECISION,
    ADD COLUMN "actualAt"     TIMESTAMP(3),
    ADD COLUMN "actualNote"   TEXT;
