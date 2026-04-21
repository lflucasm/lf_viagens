-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "wallet_balances" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wallet_balances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wallet_balances_team_program_idx" ON "wallet_balances"("team", "program");

-- CreateIndex
CREATE INDEX "wallet_balances_cedenteId_idx" ON "wallet_balances"("cedenteId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_wallet_balance_team_cedente_program" ON "wallet_balances"("team", "cedenteId", "program");

-- AddForeignKey
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wallet_balances" ADD CONSTRAINT "wallet_balances_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
