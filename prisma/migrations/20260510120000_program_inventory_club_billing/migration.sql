-- CreateEnum
CREATE TYPE "ClubBillingCycle" AS ENUM ('MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "ProgramLedgerKind" AS ENUM (
  'POINTS_PURCHASE',
  'CLUB_MONTHLY_CREDIT',
  'BONUS',
  'TRANSFER_OUT',
  'TRANSFER_IN',
  'SALE',
  'ADJUSTMENT'
);

-- AlterTable
ALTER TABLE "club_subscriptions" ADD COLUMN "isRecurrent" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "club_subscriptions" ADD COLUMN "billingCycle" "ClubBillingCycle" NOT NULL DEFAULT 'MONTHLY';
ALTER TABLE "club_subscriptions" ADD COLUMN "pointsPerMonth" INTEGER;

-- CreateTable
CREATE TABLE "cedente_program_inventories" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "costBasisCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedente_program_inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedente_program_ledger_entries" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "kind" "ProgramLedgerKind" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "costDeltaCents" INTEGER NOT NULL DEFAULT 0,
    "bonusPoints" INTEGER NOT NULL DEFAULT 0,
    "peerProgram" "LoyaltyProgram",
    "note" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cedente_program_ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_cedente_program_inventory" ON "cedente_program_inventories"("cedenteId", "program");

-- CreateIndex
CREATE INDEX "cedente_program_inventories_team_program_idx" ON "cedente_program_inventories"("team", "program");

-- CreateIndex
CREATE INDEX "cedente_program_inventories_cedenteId_idx" ON "cedente_program_inventories"("cedenteId");

-- CreateIndex
CREATE INDEX "cedente_program_ledger_entries_cedenteId_program_occurredAt_idx" ON "cedente_program_ledger_entries"("cedenteId", "program", "occurredAt");

-- CreateIndex
CREATE INDEX "cedente_program_ledger_entries_team_occurredAt_idx" ON "cedente_program_ledger_entries"("team", "occurredAt");

-- AddForeignKey
ALTER TABLE "cedente_program_inventories" ADD CONSTRAINT "cedente_program_inventories_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_program_ledger_entries" ADD CONSTRAINT "cedente_program_ledger_entries_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
