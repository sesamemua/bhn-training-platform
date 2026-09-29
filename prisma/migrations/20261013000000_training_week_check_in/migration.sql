-- Training Week check-in: a pass code per registration, and a check-in
-- per seat (each session is its own room and its own door).
ALTER TABLE "EventFormSubmission" ADD COLUMN "checkInToken" TEXT;
CREATE UNIQUE INDEX "EventFormSubmission_checkInToken_key" ON "EventFormSubmission"("checkInToken");

ALTER TABLE "WorkshopBooking" ADD COLUMN "checkedInAt" TIMESTAMP(3);
ALTER TABLE "WorkshopBooking" ADD COLUMN "checkedInById" TEXT;
ALTER TABLE "WorkshopBooking" ADD COLUMN "checkInMethod" TEXT;
