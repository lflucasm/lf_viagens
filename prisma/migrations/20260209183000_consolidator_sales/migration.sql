-- CreateEnum
CREATE TYPE "ConsolidatorSaleSettlementStatus" AS ENUM ('AWAITING_CONSOLIDATOR_PAYMENT', 'RELEASED');

-- CreateTable
CREATE TABLE "consolidator_sales" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "consolidatorName" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "commissionBps" INTEGER,
    "status" "ConsolidatorSaleSettlementStatus" NOT NULL DEFAULT 'AWAITING_CONSOLIDATOR_PAYMENT',
    "releasedAt" TIMESTAMP(3),
    "releasedById" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consolidator_sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consolidator_sales_team_status_idx" ON "consolidator_sales"("team", "status");

-- CreateIndex
CREATE INDEX "consolidator_sales_team_createdAt_idx" ON "consolidator_sales"("team", "createdAt");

-- AddForeignKey
ALTER TABLE "consolidator_sales" ADD CONSTRAINT "consolidator_sales_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consolidator_sales" ADD CONSTRAINT "consolidator_sales_releasedById_fkey" FOREIGN KEY ("releasedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
