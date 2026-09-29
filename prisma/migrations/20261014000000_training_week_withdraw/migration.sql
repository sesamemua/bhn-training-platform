-- "I can't make it": when a registrant released their own seat, and why.
ALTER TABLE "WorkshopBooking" ADD COLUMN "withdrawnAt" TIMESTAMP(3);
ALTER TABLE "WorkshopBooking" ADD COLUMN "withdrawReason" TEXT;
