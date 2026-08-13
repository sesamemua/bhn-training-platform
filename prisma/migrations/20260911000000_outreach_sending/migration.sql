-- Outreach: let the platform send the email itself, and record what it sent.
--
-- Until now Outreach only drafted: it filled a template and handed the user a
-- mailto: link, and OutreachCampaign.sentPersonIds recorded the human's claim
-- that they had sent it from their own client. Once the platform sends, that
-- array is no longer a truthful record — it cannot express "attempted and
-- bounced", and appending to it optimistically would mark a partner reached
-- (and stamp introSentAt, reclassifying them as "returning") on a send that
-- actually failed.
--
-- OutreachSend is the server-side ledger. The unique (campaignId, personId)
-- is the idempotency key: a double-click, a retry, or a refreshed page cannot
-- email the same partner twice.
CREATE TABLE "OutreachSend" (
    "id"         TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "personId"   TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "status"     TEXT NOT NULL DEFAULT 'queued',
    "detail"     TEXT,
    "subject"    TEXT NOT NULL DEFAULT '',
    "body"       TEXT NOT NULL DEFAULT '',
    "sentAt"     TIMESTAMP(3),
    "byId"       TEXT,
    "byName"     TEXT NOT NULL DEFAULT 'BHN team',
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachSend_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OutreachSend_campaignId_personId_key"
    ON "OutreachSend"("campaignId", "personId");
CREATE INDEX "OutreachSend_campaignId_status_idx"
    ON "OutreachSend"("campaignId", "status");

ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_campaignId_fkey"
    FOREIGN KEY ("campaignId") REFERENCES "OutreachCampaign"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutreachSend" ADD CONSTRAINT "OutreachSend_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "OutreachPerson"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CASL: an unsubscribe mechanism has to stay valid for 60 days after the
-- message and be honoured within 10 business days. Keeping the opt-out on the
-- person means it applies across every list and every future campaign, not
-- just the one they opted out of.
ALTER TABLE "OutreachPerson" ADD COLUMN "unsubscribedAt"  TIMESTAMP(3);
ALTER TABLE "OutreachPerson" ADD COLUMN "unsubscribeNote" TEXT;
