-- Append-only log of every newsletter reminder send: real sends,
-- forwarding copies, tests, and failures. The reminder row only carries
-- the LAST send, which can't answer "have we already chased them, and
-- what did we actually say". Additive; nothing existing changes.

CREATE TABLE "NewsletterSendLog" (
    "id"         TEXT         NOT NULL,
    "reminderId" TEXT         NOT NULL,
    "kind"       TEXT         NOT NULL,
    "mode"       TEXT         NOT NULL,
    "status"     TEXT         NOT NULL,
    "subject"    TEXT         NOT NULL,
    "sentTo"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "sentCc"     TEXT[]       NOT NULL DEFAULT ARRAY[]::TEXT[],
    "error"      TEXT,
    "sentById"   TEXT,
    "sentByName" TEXT,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NewsletterSendLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NewsletterSendLog_reminderId_createdAt_idx"
    ON "NewsletterSendLog" ("reminderId", "createdAt");

ALTER TABLE "NewsletterSendLog"
    ADD CONSTRAINT "NewsletterSendLog_reminderId_fkey"
    FOREIGN KEY ("reminderId") REFERENCES "NewsletterReminder"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
