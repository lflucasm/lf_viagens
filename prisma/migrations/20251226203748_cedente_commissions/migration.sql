-- CreateEnum
CREATE TYPE "CedenteCommissionStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- CreateTable
CREATE TABLE "cedente_commissions" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "status" "CedenteCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById" TEXT,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedente_commissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cedente_commissions_purchaseId_key" ON "cedente_commissions"("purchaseId");

-- CreateIndex
CREATE INDEX "cedente_commissions_cedenteId_status_generatedAt_idx" ON "cedente_commissions"("cedenteId", "status", "generatedAt");

-- CreateIndex
CREATE INDEX "cedente_commissions_paidAt_idx" ON "cedente_commissions"("paidAt");

-- AddForeignKey
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_generatedById_fkey" FOREIGN KEY ("generatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_commissions" ADD CONSTRAINT "cedente_commissions_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
