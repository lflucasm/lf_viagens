-- CreateEnum
CREATE TYPE "EmissionSource" AS ENUM ('SALE', 'MANUAL', 'ADJUSTMENT');

-- CreateTable
CREATE TABLE "emission_events" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "passengersCount" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "source" "EmissionSource" NOT NULL DEFAULT 'SALE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emission_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "emission_events_cedenteId_program_issuedAt_idx" ON "emission_events"("cedenteId", "program", "issuedAt");

-- CreateIndex
CREATE INDEX "emission_events_program_issuedAt_idx" ON "emission_events"("program", "issuedAt");

-- AddForeignKey
ALTER TABLE "emission_events" ADD CONSTRAINT "emission_events_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
