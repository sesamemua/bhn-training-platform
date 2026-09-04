-- Reviewer-only notes pinned to a point on a page of an EQUIP
-- attachment.
--
-- Its own table rather than a column on the application, and
-- deliberately separate from EquipApplicationMessage (which is the
-- APPLICANT-visible thread): keeping them apart means no query can
-- accidentally leak reviewer notes into an applicant-facing view.
--
-- x/y are normalized 0..1 within the rendered page box, so a pin
-- lands in the same place at any zoom or window size. The uploaded
-- file in R2 is never modified — these coordinates point at it.

CREATE TABLE "EquipDocumentNote" (
    "id"            TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "documentKey"   TEXT NOT NULL,
    "page"          INTEGER NOT NULL DEFAULT 1,
    "x"             DOUBLE PRECISION NOT NULL,
    "y"             DOUBLE PRECISION NOT NULL,
    "body"          TEXT NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'open',
    "authorId"      TEXT,
    "authorName"    TEXT NOT NULL,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipDocumentNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EquipDocumentNote_applicationId_documentKey_page_idx"
    ON "EquipDocumentNote"("applicationId", "documentKey", "page");

ALTER TABLE "EquipDocumentNote"
    ADD CONSTRAINT "EquipDocumentNote_applicationId_fkey"
    FOREIGN KEY ("applicationId") REFERENCES "EquipApplication"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "EquipDocumentNote"
    ADD CONSTRAINT "EquipDocumentNote_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
