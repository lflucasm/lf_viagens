-- CreateEnum
CREATE TYPE "ReceberStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'CANCELED');

-- CreateEnum
CREATE TYPE "ReceberCategoria" AS ENUM ('EMPRESTIMO', 'CARTAO', 'PARCELAMENTO', 'SERVICO', 'OUTROS');

-- CreateEnum
CREATE TYPE "ReceberMetodo" AS ENUM ('PIX', 'CARTAO', 'BOLETO', 'DINHEIRO', 'TRANSFERENCIA', 'OUTRO');

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "dividas_a_receber" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "debtorName" TEXT NOT NULL,
    "debtorDoc" TEXT,
    "debtorPhone" TEXT,
    "debtorEmail" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "ReceberCategoria" NOT NULL DEFAULT 'OUTROS',
    "method" "ReceberMetodo" NOT NULL DEFAULT 'PIX',
    "totalCents" INTEGER NOT NULL,
    "receivedCents" INTEGER NOT NULL DEFAULT 0,
    "dueDate" TIMESTAMP(3),
    "status" "ReceberStatus" NOT NULL DEFAULT 'OPEN',
    "sourceLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dividas_a_receber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dividas_a_receber_pagamentos" (
    "id" TEXT NOT NULL,
    "dividaId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" "ReceberMetodo" NOT NULL DEFAULT 'PIX',
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dividas_a_receber_pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "dividas_a_receber_team_status_idx" ON "dividas_a_receber"("team", "status");

-- CreateIndex
CREATE INDEX "dividas_a_receber_team_dueDate_idx" ON "dividas_a_receber"("team", "dueDate");

-- CreateIndex
CREATE INDEX "dividas_a_receber_ownerId_idx" ON "dividas_a_receber"("ownerId");

-- CreateIndex
CREATE INDEX "dividas_a_receber_createdAt_idx" ON "dividas_a_receber"("createdAt");

-- CreateIndex
CREATE INDEX "dividas_a_receber_pagamentos_dividaId_idx" ON "dividas_a_receber_pagamentos"("dividaId");

-- CreateIndex
CREATE INDEX "dividas_a_receber_pagamentos_receivedAt_idx" ON "dividas_a_receber_pagamentos"("receivedAt");

-- AddForeignKey
ALTER TABLE "dividas_a_receber" ADD CONSTRAINT "dividas_a_receber_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dividas_a_receber_pagamentos" ADD CONSTRAINT "dividas_a_receber_pagamentos_dividaId_fkey" FOREIGN KEY ("dividaId") REFERENCES "dividas_a_receber"("id") ON DELETE CASCADE ON UPDATE CASCADE;
