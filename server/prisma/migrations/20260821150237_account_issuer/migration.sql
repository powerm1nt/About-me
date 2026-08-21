-- AlterTable
ALTER TABLE "account" ADD COLUMN     "issuer" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "verification" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "account_issuer_accountId_key" ON "account"("issuer", "accountId");
