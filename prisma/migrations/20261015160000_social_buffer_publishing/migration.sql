ALTER TABLE "SocialPost" ADD COLUMN "bufferPostId" TEXT;
ALTER TABLE "SocialPost" ADD COLUMN "publishError" TEXT;
CREATE UNIQUE INDEX "SocialPost_bufferPostId_key" ON "SocialPost"("bufferPostId");
