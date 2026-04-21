-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "finalAvgMilheiroCents" INTEGER,
ADD COLUMN     "finalPax" INTEGER,
ADD COLUMN     "finalProfitCents" INTEGER,
ADD COLUMN     "finalSalesCents" INTEGER,
ADD COLUMN     "finalSoldPoints" INTEGER,
ADD COLUMN     "finalizedAt" TIMESTAMP(3),
ADD COLUMN     "finalizedById" TEXT;

-- CreateIndex
CREATE INDEX "purchases_finalizedAt_idx" ON "purchases"("finalizedAt");

-- CreateIndex
CREATE INDEX "purchases_finalizedById_idx" ON "purchases"("finalizedById");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
