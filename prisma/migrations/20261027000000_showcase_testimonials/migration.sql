-- Testimonial links: guide questions answered by typing or a short recording, and which programme(s) the person is in.
ALTER TABLE "ShowcaseGroup" ADD COLUMN "questions" JSONB;
ALTER TABLE "ShowcaseGroup" ADD COLUMN "programChoices" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ShowcaseSubmission" ADD COLUMN "programs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "ShowcaseSubmission" ADD COLUMN "answers" JSONB;
