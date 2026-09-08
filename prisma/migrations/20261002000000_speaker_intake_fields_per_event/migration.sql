-- Which optional questions the speaker intake form asks, per event.
--
-- The session pitch and the LinkedIn URL were hidden globally on
-- 2026-08-28; the session title stayed. That was one decision applied to
-- every event, and it left an event whose speakerPitchMaxWords had been
-- raised to 250 with no pitch field to govern. Per event now.
--
-- Defaults are true, which restores what the form asked before that
-- commit. Existing rows take the defaults.

ALTER TABLE "BhnEvent"
    ADD COLUMN "speakerAskSessionTitle" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "speakerAskSessionPitch" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "speakerAskLinkedin"     BOOLEAN NOT NULL DEFAULT true;

-- Industry Insights asks what you will speak to, not for a programme
-- line: its five August submissions all filled the pitch and none had a
-- session title, and its pitch limit was raised to 250 words on purpose.
UPDATE "BhnEvent"
   SET "speakerAskSessionTitle" = false
 WHERE "slug" = '2026-industry-insights';
