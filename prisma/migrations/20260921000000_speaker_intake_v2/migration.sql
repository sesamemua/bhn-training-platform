-- Speaker intake round two: the LinkedIn profile and the speaker's own
-- description of what their session offers. Additive.

ALTER TABLE "Speaker"
    ADD COLUMN "linkedinUrl"  TEXT,
    ADD COLUMN "sessionPitch" TEXT;
