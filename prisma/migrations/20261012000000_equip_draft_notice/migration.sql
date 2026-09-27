-- When the applicant was first emailed the link to their public draft,
-- with the two-week notice. Drafts are removed two weeks after this.
ALTER TABLE "EquipApplication" ADD COLUMN "draftNoticeSentAt" TIMESTAMP(3);
