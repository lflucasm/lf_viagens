-- CreateEnum
CREATE TYPE "LoyaltyProgram" AS ENUM ('LATAM', 'SMILES', 'LIVELO', 'ESFERA');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('OPEN', 'UNBLOCKED', 'CANCELED');

-- CreateTable
CREATE TABLE "blocked_accounts" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "status" "BlockStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "estimatedUnlockAt" TIMESTAMP(3),
    "createdById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "blocked_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "block_observations" (
    "id" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "block_observations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocked_accounts_cedenteId_idx" ON "blocked_accounts"("cedenteId");

-- CreateIndex
CREATE INDEX "blocked_accounts_program_idx" ON "blocked_accounts"("program");

-- CreateIndex
CREATE INDEX "blocked_accounts_status_idx" ON "blocked_accounts"("status");

-- CreateIndex
CREATE INDEX "blocked_accounts_createdAt_idx" ON "blocked_accounts"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_open_block_per_program" ON "blocked_accounts"("cedenteId", "program", "status");

-- CreateIndex
CREATE INDEX "block_observations_blockedId_idx" ON "block_observations"("blockedId");

-- CreateIndex
CREATE INDEX "block_observations_createdAt_idx" ON "block_observations"("createdAt");

-- AddForeignKey
ALTER TABLE "blocked_accounts" ADD CONSTRAINT "blocked_accounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocked_accounts" ADD CONSTRAINT "blocked_accounts_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_observations" ADD CONSTRAINT "block_observations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "block_observations" ADD CONSTRAINT "block_observations_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "blocked_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
