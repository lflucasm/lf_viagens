-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "CaixaImediatoSnapshot" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "cashCents" INTEGER NOT NULL DEFAULT 0,
    "totalBrutoCents" INTEGER NOT NULL DEFAULT 0,
    "totalDividasCents" INTEGER NOT NULL DEFAULT 0,
    "totalLiquidoCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaixaImediatoSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CaixaImediatoSnapshot_team_date_idx" ON "CaixaImediatoSnapshot"("team", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CaixaImediatoSnapshot_team_date_key" ON "CaixaImediatoSnapshot"("team", "date");
