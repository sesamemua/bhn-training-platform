-- Audit trail for notifications, and what the rate limit counts.
-- Purely additive: one new table, no changes to existing rows.
CREATE TABLE "NotifyLog" (
    "id" TEXT NOT NULL,
    "featureId" TEXT NOT NULL,
    "context" TEXT,
    "recipient" TEXT NOT NULL,
    "senderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotifyLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NotifyLog_senderId_createdAt_idx" ON "NotifyLog"("senderId", "createdAt");
CREATE INDEX "NotifyLog_featureId_createdAt_idx" ON "NotifyLog"("featureId", "createdAt");

ALTER TABLE "NotifyLog" ADD CONSTRAINT "NotifyLog_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
