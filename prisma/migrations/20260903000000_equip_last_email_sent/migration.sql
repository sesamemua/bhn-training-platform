-- Applicant emails past the submission receipt are now sent only by an
-- explicit reviewer action (POST .../send-email), never as a side effect
-- of a decision. These two nullable columns are that action's own
-- record, so the review page can show what was actually sent and when
-- rather than assuming a decision implied a notification.

ALTER TABLE "EquipApplication"
    ADD COLUMN "lastEmailSentAt"     TIMESTAMP(3),
    ADD COLUMN "lastEmailTemplateId" TEXT;
