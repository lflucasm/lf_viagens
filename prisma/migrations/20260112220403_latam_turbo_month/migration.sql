-- CreateEnum
CREATE TYPE "LatamTurboStatus" AS ENUM ('PENDING', 'TRANSFERRED', 'SKIPPED');

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "latam_turbo_months" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "status" "LatamTurboStatus" NOT NULL DEFAULT 'PENDING',
    "points" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "latam_turbo_months_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "latam_turbo_months_team_monthKey_status_idx" ON "latam_turbo_months"("team", "monthKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "latam_turbo_months_team_monthKey_cedenteId_key" ON "latam_turbo_months"("team", "monthKey", "cedenteId");

-- AddForeignKey
ALTER TABLE "latam_turbo_months" ADD CONSTRAINT "latam_turbo_months_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
