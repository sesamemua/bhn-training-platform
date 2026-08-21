-- A seat can now belong to a registration that came through the PUBLIC
-- form, where the person has no account.
--
-- Additive apart from making userId nullable, which only ever widens
-- what the column accepts. There are no WorkshopBooking rows at the
-- time of writing, so nothing is migrated.

ALTER TABLE "WorkshopBooking" ALTER COLUMN "userId" DROP NOT NULL;

ALTER TABLE "WorkshopBooking"
    ADD COLUMN "submissionId" TEXT,
    ADD COLUMN "rank"         INTEGER,
    ADD COLUMN "decisionNote" TEXT;

-- One seat per workshop per registration, the same guarantee the
-- account-holder side already has.
CREATE UNIQUE INDEX "WorkshopBooking_workshopId_submissionId_key"
    ON "WorkshopBooking"("workshopId", "submissionId");

-- "The seats this registration asked for, in rank order."
CREATE INDEX "WorkshopBooking_submissionId_rank_idx"
    ON "WorkshopBooking"("submissionId", "rank");

-- Deleting a registration removes the seats it asked for: a booking
-- with no registration behind it is a seat nobody can explain.
ALTER TABLE "WorkshopBooking"
    ADD CONSTRAINT "WorkshopBooking_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "EventFormSubmission"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
