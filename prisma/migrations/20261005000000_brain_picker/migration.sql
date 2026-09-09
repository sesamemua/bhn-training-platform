-- Brain Picker: asking a colleague to look at something, and keeping a
-- record of what you promised them in return.
--
--   BrainProfile — what a person is good at. One row per person, edited
--                  in place from their card. Seeded lazily: no row means
--                  the page falls back to a drafted line.
--
--   BrainPick    — one ask. `probe` names an optional check for whether
--                  the person actually did the thing, as distinct from
--                  saying they would; today the only one is
--                  "merch-starred", which counts their MerchPick rows.

CREATE TABLE "BrainProfile" (
    "id"           TEXT NOT NULL,
    "userId"       TEXT NOT NULL,
    -- What they are worth picking for.
    "speciality"   TEXT NOT NULL,
    -- What they charge. The joke, delivered with a straight face.
    "rate"         TEXT NOT NULL DEFAULT 'Free, apparently',
    "updatedById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrainProfile_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BrainProfile_userId_key" ON "BrainProfile"("userId");

ALTER TABLE "BrainProfile" ADD CONSTRAINT "BrainProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrainProfile" ADD CONSTRAINT "BrainProfile_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "BrainPick" (
    "id"         TEXT NOT NULL,
    "askedById"  TEXT NOT NULL,
    "askedOfId"  TEXT NOT NULL,
    "subject"    TEXT NOT NULL,
    "body"       TEXT NOT NULL,
    -- The thing you want them to look at, when there is one.
    "href"       TEXT,
    -- question | task | favour
    "kind"       TEXT NOT NULL DEFAULT 'question',
    -- open | answered | declined
    "status"     TEXT NOT NULL DEFAULT 'open',
    -- Named check for whether they did it. NULL = their word is all we have.
    "probe"      TEXT,
    -- What you offered in return. Counted by the ledger; usually 'nothing'.
    "bribe"      TEXT NOT NULL DEFAULT 'nothing',
    "answer"     TEXT,
    "answeredAt" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrainPick_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BrainPick_askedOfId_status_idx" ON "BrainPick"("askedOfId", "status");
CREATE INDEX "BrainPick_askedById_createdAt_idx" ON "BrainPick"("askedById", "createdAt");

ALTER TABLE "BrainPick" ADD CONSTRAINT "BrainPick_askedById_fkey"
    FOREIGN KEY ("askedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BrainPick" ADD CONSTRAINT "BrainPick_askedOfId_fkey"
    FOREIGN KEY ("askedOfId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
