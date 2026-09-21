-- Knowledge Exchange awardee intake: one row per submission of the public
-- form at /knowledge-exchange/awardee. `round` is set by the team.
CREATE TABLE "KnowledgeExchangeAwardee" (
    "id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "fullName" TEXT NOT NULL,
    "projectTitle" TEXT NOT NULL,
    "projectSummary" TEXT NOT NULL,
    "homeInstitution" TEXT NOT NULL,
    "hostInstitution" TEXT NOT NULL,
    "hostDepartment" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "linkedinUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeExchangeAwardee_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "KnowledgeExchangeAwardee_round_createdAt_idx" ON "KnowledgeExchangeAwardee"("round", "createdAt");
