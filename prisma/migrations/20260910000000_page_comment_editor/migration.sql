-- Website review: record who last edited a comment.
--
-- Any reviewer can now edit any comment, so "edited" on its own no longer
-- says whose words these are. The export brief prints the author's name
-- above the body, and without this the brief would attribute a colleague's
-- rewording to the original author.
--
-- Additive and nullable: existing rows keep NULL, which reads as "never
-- edited, or edited before we recorded it" — the UI treats both the same.
-- No FK to "User" on purpose; the brief and the cross-origin overlay need a
-- display name without a join, and the label should outlive the account.
ALTER TABLE "PageComment" ADD COLUMN "editedById" TEXT;
ALTER TABLE "PageComment" ADD COLUMN "editedByName" TEXT;
