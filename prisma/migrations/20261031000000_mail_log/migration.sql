-- What was sent to whom: one row per message, so a registrant's past communications can be shown.
CREATE TABLE "MailLog" (
  "id" TEXT NOT NULL,
  "to" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "byName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MailLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MailLog_to_createdAt_idx" ON "MailLog"("to", "createdAt");
