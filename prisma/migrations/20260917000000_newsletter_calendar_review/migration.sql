-- Newsletter production workflow: a content calendar that plans one issue
-- a month, the reminders that chase it, element-pinned review notes on the
-- rendered issue, and a single sign-off record.
--
-- Hand-written rather than generated: `prisma migrate diff` against this
-- database also emits the pre-existing category-B drift (FK referential
-- actions, DROP DEFAULT churn) documented in
-- 20260916000000_fresh_replay_repairs. Only the new objects belong here.
--
-- Conventions followed: no Prisma enums — status/kind/mode are commented
-- Strings; calendar milestones are "YYYY-MM-DD" TEXT, not timestamps,
-- because a production schedule is an agreement about days; author and
-- approver ids are plain columns with no FK so a record outlives the
-- account that made it.

-- One month of production. `month` is unique: one issue per month is the
-- premise of the whole calendar, and the constraint is what makes
-- re-planning the same span idempotent.
CREATE TABLE "NewsletterCycle" (
    "id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "draftOpen" TEXT NOT NULL,
    "draftDue" TEXT NOT NULL,
    "buildStart" TEXT NOT NULL,
    "approvalDue" TEXT NOT NULL,
    "sendDate" TEXT NOT NULL,
    "sendDateAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "issueId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvalNote" TEXT,
    "configSnapshot" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterCycle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterCycle_month_key" ON "NewsletterCycle"("month");
CREATE INDEX "NewsletterCycle_sendDate_idx" ON "NewsletterCycle"("sendDate");
CREATE INDEX "NewsletterCycle_status_sendDate_idx" ON "NewsletterCycle"("status", "sendDate");

-- One scheduled nudge. UNIQUE (cycleId, kind) is the idempotency key: the
-- daily sweep claims a row by flipping status to 'sent' before it mails,
-- so a cron that fires twice cannot email twice.
CREATE TABLE "NewsletterReminder" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "scheduledFor" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "sentTo" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentCc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "sentById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterReminder_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NewsletterReminder_cycleId_kind_key" ON "NewsletterReminder"("cycleId", "kind");
CREATE INDEX "NewsletterReminder_status_scheduledFor_idx" ON "NewsletterReminder"("status", "scheduledFor");

ALTER TABLE "NewsletterReminder"
    ADD CONSTRAINT "NewsletterReminder_cycleId_fkey"
    FOREIGN KEY ("cycleId") REFERENCES "NewsletterCycle"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- A review note pinned to one element of the rendered issue. Anchored by
-- piece id + quoted text rather than a CSS path, because the newsletter
-- HTML is regenerated on every AI layout run and a structural selector
-- would go stale each time; the quote usually survives.
CREATE TABLE "NewsletterComment" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "pieceId" TEXT,
    "anchorQuote" TEXT,
    "anchorLabel" TEXT,
    "cssPath" TEXT,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "authorId" TEXT,
    "authorName" TEXT,
    "editedById" TEXT,
    "editedByName" TEXT,
    "editedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsletterComment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsletterComment_issueId_status_createdAt_idx" ON "NewsletterComment"("issueId", "status", "createdAt");
CREATE INDEX "NewsletterComment_issueId_pieceId_idx" ON "NewsletterComment"("issueId", "pieceId");

ALTER TABLE "NewsletterComment"
    ADD CONSTRAINT "NewsletterComment_issueId_fkey"
    FOREIGN KEY ("issueId") REFERENCES "NewsletterIssue"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
