-- CreateTable
CREATE TABLE "LlmSetting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEnc" TEXT,
    "baseUrl" TEXT,
    "modelMain" TEXT,
    "modelFast" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LlmSetting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LlmSetting_userId_key" ON "LlmSetting"("userId");

-- AddForeignKey
ALTER TABLE "LlmSetting" ADD CONSTRAINT "LlmSetting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
