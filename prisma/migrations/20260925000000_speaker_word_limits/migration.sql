-- Per-event word limits for the speaker intake form.
-- Purely additive: two nullable columns. NULL keeps the existing
-- platform defaults, so every current event behaves exactly as before.
ALTER TABLE "BhnEvent" ADD COLUMN "speakerBioMaxWords" INTEGER;
ALTER TABLE "BhnEvent" ADD COLUMN "speakerPitchMaxWords" INTEGER;
