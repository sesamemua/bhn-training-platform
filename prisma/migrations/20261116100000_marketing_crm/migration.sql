-- AlterTable
ALTER TABLE "OutreachList" ADD COLUMN     "filter" JSONB;

-- AlterTable
ALTER TABLE "OutreachPerson" ADD COLUMN     "leadStatus" TEXT NOT NULL DEFAULT 'new',
ADD COLUMN     "lifecycle" TEXT NOT NULL DEFAULT 'lead',
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "ownerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'manual';

-- AlterTable
ALTER TABLE "OutreachSend" ADD COLUMN     "clickedAt" TIMESTAMP(3),
ADD COLUMN     "clicks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "opens" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OutreachTask" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "notes" TEXT NOT NULL DEFAULT '',
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "personId" TEXT,
    "dealId" TEXT,
    "assigneeId" TEXT,
    "assigneeName" TEXT NOT NULL DEFAULT '',
    "byName" TEXT NOT NULL DEFAULT 'BHN team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachDeal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "org" TEXT NOT NULL DEFAULT '',
    "stage" TEXT NOT NULL DEFAULT 'lead',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "closeDate" TIMESTAMP(3),
    "personId" TEXT,
    "ownerId" TEXT,
    "ownerName" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachDeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSequence" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "steps" JSONB NOT NULL,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "byName" TEXT NOT NULL DEFAULT 'BHN team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSequence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachEnrollment" (
    "id" TEXT NOT NULL,
    "sequenceId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "nextDueAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "byName" TEXT NOT NULL DEFAULT 'BHN team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachLink" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "url" TEXT NOT NULL,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "lastAt" TIMESTAMP(3),
    "byName" TEXT NOT NULL DEFAULT 'BHN team',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OutreachTask_doneAt_dueAt_idx" ON "OutreachTask"("doneAt", "dueAt");

-- CreateIndex
CREATE INDEX "OutreachTask_personId_idx" ON "OutreachTask"("personId");

-- CreateIndex
CREATE INDEX "OutreachDeal_stage_order_idx" ON "OutreachDeal"("stage", "order");

-- CreateIndex
CREATE INDEX "OutreachEnrollment_status_nextDueAt_idx" ON "OutreachEnrollment"("status", "nextDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachEnrollment_sequenceId_personId_key" ON "OutreachEnrollment"("sequenceId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachLink_slug_key" ON "OutreachLink"("slug");

-- AddForeignKey
ALTER TABLE "OutreachTask" ADD CONSTRAINT "OutreachTask_personId_fkey" FOREIGN KEY ("personId") REFERENCES "OutreachPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachTask" ADD CONSTRAINT "OutreachTask_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "OutreachDeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachDeal" ADD CONSTRAINT "OutreachDeal_personId_fkey" FOREIGN KEY ("personId") REFERENCES "OutreachPerson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEnrollment" ADD CONSTRAINT "OutreachEnrollment_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "OutreachSequence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachEnrollment" ADD CONSTRAINT "OutreachEnrollment_personId_fkey" FOREIGN KEY ("personId") REFERENCES "OutreachPerson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

