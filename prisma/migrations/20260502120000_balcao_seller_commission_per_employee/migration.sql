-- AlterTable
ALTER TABLE "users" ADD COLUMN "balcaoSellerCommissionPercent" INTEGER;

-- AlterTable
ALTER TABLE "balcao_operacoes" ADD COLUMN "sellerCommissionPercent" INTEGER;
