-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELED');

-- CreateEnum
CREATE TYPE "PurchaseItemType" AS ENUM ('CLUB', 'POINTS_BUY', 'TRANSFER', 'ADJUSTMENT', 'EXTRA_COST');

-- CreateEnum
CREATE TYPE "PurchaseItemStatus" AS ENUM ('PENDING', 'RELEASED', 'CANCELED');

-- CreateEnum
CREATE TYPE "TransferMode" AS ENUM ('FULL_POINTS', 'POINTS_PLUS_CASH');

-- CreateTable
CREATE TABLE "purchases" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "status" "PurchaseStatus" NOT NULL DEFAULT 'OPEN',
    "cedentePayCents" INTEGER NOT NULL DEFAULT 0,
    "vendorCommissionBps" INTEGER NOT NULL DEFAULT 100,
    "extraPoints" INTEGER NOT NULL DEFAULT 0,
    "extraPointsCostCents" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_items" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "type" "PurchaseItemType" NOT NULL,
    "status" "PurchaseItemStatus" NOT NULL DEFAULT 'PENDING',
    "programFrom" "LoyaltyProgram",
    "programTo" "LoyaltyProgram",
    "pointsBase" INTEGER NOT NULL DEFAULT 0,
    "bonusMode" TEXT,
    "bonusValue" INTEGER,
    "pointsFinal" INTEGER NOT NULL DEFAULT 0,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "transferMode" "TransferMode",
    "pointsDebitedFromOrigin" INTEGER NOT NULL DEFAULT 0,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "purchases_cedenteId_idx" ON "purchases"("cedenteId");

-- CreateIndex
CREATE INDEX "purchases_status_idx" ON "purchases"("status");

-- CreateIndex
CREATE INDEX "purchase_items_purchaseId_idx" ON "purchase_items"("purchaseId");

-- CreateIndex
CREATE INDEX "purchase_items_type_idx" ON "purchase_items"("type");

-- CreateIndex
CREATE INDEX "purchase_items_status_idx" ON "purchase_items"("status");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_items" ADD CONSTRAINT "purchase_items_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
