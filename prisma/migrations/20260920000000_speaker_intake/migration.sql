-- Speaker intake: collect a guest speaker's own details (headshot, title,
-- organisation, bio, topics) through a public form instead of chasing
-- them over email. Additive; existing seeded speakers are untouched.

ALTER TABLE "Speaker"
    ADD COLUMN "topics"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "contactEmail" TEXT,
    ADD COLUMN "submittedAt"  TIMESTAMP(3);

-- Off by default: the public form must be opened deliberately per event.
ALTER TABLE "BhnEvent"
    ADD COLUMN "speakerIntakeOpen" BOOLEAN NOT NULL DEFAULT false;
