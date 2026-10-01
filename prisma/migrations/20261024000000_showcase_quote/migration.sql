-- A showcase group can ask one written question (a quote), with a word limit, and name the photo it wants.
ALTER TABLE "ShowcaseGroup" ADD COLUMN "quotePrompt" TEXT;
ALTER TABLE "ShowcaseGroup" ADD COLUMN "quoteMaxWords" INTEGER NOT NULL DEFAULT 250;
ALTER TABLE "ShowcaseGroup" ADD COLUMN "photoLabel" TEXT;
ALTER TABLE "ShowcaseSubmission" ADD COLUMN "quote" TEXT;
