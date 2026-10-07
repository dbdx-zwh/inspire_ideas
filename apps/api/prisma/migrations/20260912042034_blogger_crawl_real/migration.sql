/*
  Warnings:

  - You are about to drop the column `deepReadRatio` on the `Blogger` table. All the data in the column will be lost.
  - You are about to drop the column `recommendCount` on the `Blogger` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[userId,platform,platformUserId]` on the table `Blogger` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Blogger" DROP COLUMN "deepReadRatio",
DROP COLUMN "recommendCount",
ADD COLUMN     "crawlProgressLabel" TEXT,
ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "lastCrawledAt" TIMESTAMP(3),
ADD COLUMN     "platform" TEXT NOT NULL DEFAULT 'xiaohongshu',
ADD COLUMN     "platformUserId" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "BloggerPost" (
    "id" TEXT NOT NULL,
    "bloggerId" TEXT NOT NULL,
    "platformPostId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "extractedArxivIds" TEXT[],
    "crawledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BloggerPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BloggerPost_bloggerId_crawledAt_idx" ON "BloggerPost"("bloggerId", "crawledAt");

-- CreateIndex
CREATE UNIQUE INDEX "BloggerPost_bloggerId_platformPostId_key" ON "BloggerPost"("bloggerId", "platformPostId");

-- CreateIndex
CREATE UNIQUE INDEX "Blogger_userId_platform_platformUserId_key" ON "Blogger"("userId", "platform", "platformUserId");

-- AddForeignKey
ALTER TABLE "BloggerPost" ADD CONSTRAINT "BloggerPost_bloggerId_fkey" FOREIGN KEY ("bloggerId") REFERENCES "Blogger"("id") ON DELETE CASCADE ON UPDATE CASCADE;
