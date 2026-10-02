-- A showcase link can ask for consent (a required checkbox with this text); a submission records when it was given.
ALTER TABLE "ShowcaseGroup" ADD COLUMN "consentText" TEXT;
ALTER TABLE "ShowcaseSubmission" ADD COLUMN "consentAt" TIMESTAMP(3);
