-- Design review: questions put to the team about an artwork, and each person's answer.
CREATE TABLE "DesignQuestion" (
  "id" TEXT NOT NULL,
  "artworkId" TEXT NOT NULL,
  "text" TEXT NOT NULL,
  "options" JSONB NOT NULL DEFAULT '[]',
  "order" INTEGER NOT NULL DEFAULT 0,
  "createdByName" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignQuestion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "DesignQuestion_artworkId_order_idx" ON "DesignQuestion"("artworkId", "order");
ALTER TABLE "DesignQuestion" ADD CONSTRAINT "DesignQuestion_artworkId_fkey" FOREIGN KEY ("artworkId") REFERENCES "DesignArtwork"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "DesignAnswer" (
  "id" TEXT NOT NULL,
  "questionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "userName" TEXT NOT NULL,
  "choice" TEXT,
  "text" TEXT NOT NULL DEFAULT '',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DesignAnswer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DesignAnswer_questionId_userId_key" ON "DesignAnswer"("questionId", "userId");
ALTER TABLE "DesignAnswer" ADD CONSTRAINT "DesignAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DesignQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
