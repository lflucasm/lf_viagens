-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "latam_turbo_accounts" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "cpfLimit" INTEGER NOT NULL DEFAULT 25,
    "cpfUsed" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "latam_turbo_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "latam_turbo_accounts_cedenteId_key" ON "latam_turbo_accounts"("cedenteId");

-- CreateIndex
CREATE INDEX "latam_turbo_accounts_team_idx" ON "latam_turbo_accounts"("team");

-- AddForeignKey
ALTER TABLE "latam_turbo_accounts" ADD CONSTRAINT "latam_turbo_accounts_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
