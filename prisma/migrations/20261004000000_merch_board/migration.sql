-- The merch board becomes something the team decides with.
--
-- Two tables, because the board has two kinds of state:
--
--   MerchCard  — shared. One row per item the board knows about, whatever
--                its origin. A catalogue item gets a row only when somebody
--                moves it off the shortlist; a pasted product carries its
--                whole payload, because src/lib/merch/items.json is a file
--                and cannot be written to at runtime.
--
--   MerchPick  — per person. Same shape as LogoVote: (voter, item) is the
--                identity of a favourite, so starring twice is not two
--                stars.

CREATE TABLE "MerchCard" (
    "id"                  TEXT NOT NULL,
    -- Matches an id in items.json, or a slug generated for an addition.
    "itemId"              TEXT NOT NULL,
    -- catalogue | added
    "source"              TEXT NOT NULL DEFAULT 'catalogue',
    -- shortlist | not_selected
    "status"              TEXT NOT NULL DEFAULT 'shortlist',

    -- Payload. NULL for a catalogue item (items.json is the truth for
    -- those); filled for an addition, mirroring the MerchItem shape.
    "name"                TEXT,
    "tier"                INTEGER,
    "tierKey"             TEXT,
    "category"            TEXT,
    "pocketFlat"          BOOLEAN,
    "priceBreaks"         JSONB,
    "decorationSetupCad"  DOUBLE PRECISION,
    "estUnitLowCad"       DOUBLE PRECISION,
    "estUnitHighCad"      DOUBLE PRECISION,
    "supplierProductName" TEXT,
    "supplierItemCode"    TEXT,
    "productUrl"          TEXT,
    "imageUrl"            TEXT,
    "whyItWorks"          TEXT,
    "decoration"          TEXT,
    "watchOut"            TEXT,

    "addedById"           TEXT,
    "movedById"           TEXT,
    "movedAt"             TIMESTAMP(3),
    "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"           TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchCard_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchCard_itemId_key" ON "MerchCard"("itemId");
CREATE INDEX "MerchCard_status_idx" ON "MerchCard"("status");

ALTER TABLE "MerchCard" ADD CONSTRAINT "MerchCard_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MerchCard" ADD CONSTRAINT "MerchCard_movedById_fkey"
    FOREIGN KEY ("movedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MerchPick" (
    "id"        TEXT NOT NULL,
    "userId"    TEXT NOT NULL,
    "itemId"    TEXT NOT NULL,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MerchPick_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MerchPick_userId_itemId_key" ON "MerchPick"("userId", "itemId");
CREATE INDEX "MerchPick_itemId_idx" ON "MerchPick"("itemId");

ALTER TABLE "MerchPick" ADD CONSTRAINT "MerchPick_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
