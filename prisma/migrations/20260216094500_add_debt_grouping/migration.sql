-- Add optional grouping + vencimento fields to debts
ALTER TABLE "debts" ADD COLUMN "creditorName" TEXT;
ALTER TABLE "debts" ADD COLUMN "dueDate" TIMESTAMP(3);
ALTER TABLE "debts" ADD COLUMN "payOrder" INTEGER;

-- Indexes for grouping/ordering
CREATE INDEX "debts_creditorName_idx" ON "debts"("creditorName");
CREATE INDEX "debts_dueDate_idx" ON "debts"("dueDate");
CREATE INDEX "debts_payOrder_idx" ON "debts"("payOrder");
