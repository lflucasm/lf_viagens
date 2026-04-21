-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "tax_month_payments" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "totalTaxCents" INTEGER NOT NULL DEFAULT 0,
    "breakdown" JSONB,
    "paidAt" TIMESTAMP(3),
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_month_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tax_month_payments_team_month_idx" ON "tax_month_payments"("team", "month");

-- CreateIndex
CREATE INDEX "tax_month_payments_paidAt_idx" ON "tax_month_payments"("paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_tax_month_payment_team_month" ON "tax_month_payments"("team", "month");

-- AddForeignKey
ALTER TABLE "tax_month_payments" ADD CONSTRAINT "tax_month_payments_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
