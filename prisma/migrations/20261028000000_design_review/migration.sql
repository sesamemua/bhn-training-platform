-- Design review: projects of artworks (pages rendered as images), comments pinned anywhere on a page,
-- who has seen / OK'd each artwork, and the approver's decision.
CREATE TABLE "DesignProject" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "approverId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesignProject_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignArtwork" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "pages" JSONB NOT NULL,
    "sourceName" TEXT NOT NULL DEFAULT '',
    "approval" TEXT NOT NULL DEFAULT 'pending',
    "approvalNote" TEXT NOT NULL DEFAULT '',
    "approvalById" TEXT,
    "approvalAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesignArtwork_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignPin" (
    "id" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "page" INTEGER NOT NULL DEFAULT 0,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "parentId" TEXT,
    "authorId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "DesignPin_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DesignReview" (
    "id" TEXT NOT NULL,
    "artworkId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3),
    "okAt" TIMESTAMP(3),
    CONSTRAINT "DesignReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DesignArtwork_projectId_order_idx" ON "DesignArtwork"("projectId", "order");
CREATE INDEX "DesignPin_artworkId_idx" ON "DesignPin"("artworkId");
CREATE UNIQUE INDEX "DesignReview_artworkId_userId_key" ON "DesignReview"("artworkId", "userId");

ALTER TABLE "DesignArtwork" ADD CONSTRAINT "DesignArtwork_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "DesignProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignPin" ADD CONSTRAINT "DesignPin_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "DesignArtwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignPin" ADD CONSTRAINT "DesignPin_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "DesignPin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DesignReview" ADD CONSTRAINT "DesignReview_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "DesignArtwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;
