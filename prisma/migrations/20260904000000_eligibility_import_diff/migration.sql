-- What each eligibility import changed, so an admin can see who is new
-- on a list that keeps growing.
--
-- The existing rowsRead/rowsAccepted/rowsSkipped cannot answer it: an
-- import that adds one person and drops another reads as no change.
-- Empty arrays rather than null so every read is a list.

ALTER TABLE "EligibilityImport"
    ADD COLUMN "addedEmails"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "removedEmails" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
