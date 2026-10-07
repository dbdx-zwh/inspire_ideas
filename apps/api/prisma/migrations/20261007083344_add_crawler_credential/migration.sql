-- CreateTable
CREATE TABLE "CrawlerCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "storageStateEnc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'valid',
    "nickname" TEXT,
    "lastVerifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrawlerCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrawlerCredential_userId_idx" ON "CrawlerCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CrawlerCredential_userId_platform_key" ON "CrawlerCredential"("userId", "platform");

-- AddForeignKey
ALTER TABLE "CrawlerCredential" ADD CONSTRAINT "CrawlerCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
