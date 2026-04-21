-- DropIndex
DROP INDEX "debts_payOrder_idx";

-- DropIndex
DROP INDEX "settings_taxEffectiveFrom_idx";

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;
