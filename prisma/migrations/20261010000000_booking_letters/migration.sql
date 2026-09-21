-- Deciding a seat no longer sends the letter; sending is its own step.
-- Each seat remembers what the registrant was last told, so the letter
-- owed is always "from what they know to what is now true".
ALTER TABLE "WorkshopBooking" ADD COLUMN "notifiedStatus" TEXT;
ALTER TABLE "WorkshopBooking" ADD COLUMN "notifiedAt" TIMESTAMP(3);

-- Seats decided before this change were emailed at the moment of the
-- decision, so they have already been told.
UPDATE "WorkshopBooking"
SET "notifiedStatus" = "status", "notifiedAt" = "approvedAt"
WHERE "approvedAt" IS NOT NULL AND "status" IN ('confirmed', 'waitlist', 'cancelled');
