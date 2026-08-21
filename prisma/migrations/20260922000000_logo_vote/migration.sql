-- Voting on the 2026 Symposium logo candidates. Purely additive: one
-- new table, no change to anything that already holds data.
--
-- A row per (voter, candidate) rather than a list per voter, so two
-- colleagues voting at the same moment touch two rows instead of
-- racing each other for one JSON column.

CREATE TABLE "LogoVote" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "optionId"  TEXT NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LogoVote_pkey" PRIMARY KEY ("id")
);

-- One pick per person per candidate.
CREATE UNIQUE INDEX "LogoVote_userId_optionId_key" ON "LogoVote"("userId", "optionId");

-- The tally reads by candidate.
CREATE INDEX "LogoVote_optionId_idx" ON "LogoVote"("optionId");

ALTER TABLE "LogoVote"
    ADD CONSTRAINT "LogoVote_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
