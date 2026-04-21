-- CreateEnum
CREATE TYPE "ProtocolStatus" AS ENUM ('DRAFT', 'SENT', 'WAITING', 'RESOLVED', 'DENIED');

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "protocols" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "status" "ProtocolStatus" NOT NULL DEFAULT 'DRAFT',
    "title" VARCHAR(120),
    "complaint" TEXT NOT NULL,
    "response" TEXT,
    "cedenteId" TEXT NOT NULL,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocols_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protocols_team_program_status_idx" ON "protocols"("team", "program", "status");

-- CreateIndex
CREATE INDEX "protocols_team_program_cedenteId_createdAt_idx" ON "protocols"("team", "program", "cedenteId", "createdAt");

-- CreateIndex
CREATE INDEX "protocols_cedenteId_idx" ON "protocols"("cedenteId");

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "protocols" ADD CONSTRAINT "protocols_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
