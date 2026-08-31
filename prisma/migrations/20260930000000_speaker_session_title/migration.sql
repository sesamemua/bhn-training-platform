-- Collect the public-facing session title separately from the longer
-- session pitch. Existing speaker rows remain valid.

ALTER TABLE "Speaker"
    ADD COLUMN "sessionTitle" TEXT;
