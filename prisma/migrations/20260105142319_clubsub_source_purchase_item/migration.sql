/*
  Warnings:

  - A unique constraint covering the columns `[sourcePurchaseItemId]` on the table `club_subscriptions` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "club_subscriptions" ADD COLUMN     "sourcePurchaseItemId" TEXT;

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateIndex
CREATE UNIQUE INDEX "club_subscriptions_sourcePurchaseItemId_key" ON "club_subscriptions"("sourcePurchaseItemId");

-- AddForeignKey
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_sourcePurchaseItemId_fkey" FOREIGN KEY ("sourcePurchaseItemId") REFERENCES "purchase_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
