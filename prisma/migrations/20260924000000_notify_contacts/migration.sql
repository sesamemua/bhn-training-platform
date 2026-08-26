-- Address book for the platform-wide "tell a colleague" notifications.
-- Purely additive: one new table, no changes to existing rows.
CREATE TABLE "NotifyContact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotifyContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NotifyContact_email_key" ON "NotifyContact"("email");
CREATE INDEX "NotifyContact_name_idx" ON "NotifyContact"("name");

ALTER TABLE "NotifyContact" ADD CONSTRAINT "NotifyContact_addedById_fkey"
    FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
