-- CreateEnum
CREATE TYPE "SalePaymentStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');

-- CreateTable
CREATE TABLE "sales" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "points" INTEGER NOT NULL,
    "passengers" INTEGER NOT NULL,
    "milheiroCents" INTEGER NOT NULL,
    "embarqueFeeCents" INTEGER NOT NULL DEFAULT 0,
    "pointsValueCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "commissionCents" INTEGER NOT NULL DEFAULT 0,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "metaMilheiroCents" INTEGER NOT NULL DEFAULT 0,
    "feeCardLabel" TEXT,
    "locator" TEXT,
    "paymentStatus" "SalePaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "cedenteId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "purchaseId" TEXT,
    "sellerId" TEXT,
    "receivableId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_numero_key" ON "sales"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "sales_receivableId_key" ON "sales"("receivableId");

-- CreateIndex
CREATE INDEX "sales_program_date_idx" ON "sales"("program", "date");

-- CreateIndex
CREATE INDEX "sales_paymentStatus_idx" ON "sales"("paymentStatus");

-- CreateIndex
CREATE INDEX "sales_cedenteId_idx" ON "sales"("cedenteId");

-- CreateIndex
CREATE INDEX "sales_clienteId_idx" ON "sales"("clienteId");

-- CreateIndex
CREATE INDEX "sales_purchaseId_idx" ON "sales"("purchaseId");

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_receivableId_fkey" FOREIGN KEY ("receivableId") REFERENCES "Receivable"("id") ON DELETE SET NULL ON UPDATE CASCADE;
