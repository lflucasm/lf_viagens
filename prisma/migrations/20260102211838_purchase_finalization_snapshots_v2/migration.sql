/*
  Warnings:

  - Added the required column `updatedAt` to the `Receipt` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Receipt" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "receivables" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "finalBonusCents" INTEGER,
ADD COLUMN     "finalProfitBrutoCents" INTEGER,
ADD COLUMN     "finalRemainingPoints" INTEGER,
ADD COLUMN     "finalSalesPointsValueCents" INTEGER,
ADD COLUMN     "finalSalesTaxesCents" INTEGER;

-- CreateIndex
CREATE INDEX "Receipt_receivableId_idx" ON "Receipt"("receivableId");

-- CreateIndex
CREATE INDEX "Receipt_receivedAt_idx" ON "Receipt"("receivedAt");

-- CreateIndex
CREATE INDEX "receivables_status_idx" ON "receivables"("status");

-- CreateIndex
CREATE INDEX "receivables_createdAt_idx" ON "receivables"("createdAt");
