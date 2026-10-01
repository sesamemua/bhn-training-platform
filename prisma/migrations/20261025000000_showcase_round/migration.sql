-- Which award round a showcase submission belongs to (e.g. Knowledge Exchange round 2). Set by an admin; null until then.
ALTER TABLE "ShowcaseSubmission" ADD COLUMN "round" INTEGER;
