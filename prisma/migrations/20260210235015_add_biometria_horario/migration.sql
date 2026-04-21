-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "cedente_biometria_horarios" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "turnoManha" BOOLEAN NOT NULL DEFAULT false,
    "turnoTarde" BOOLEAN NOT NULL DEFAULT false,
    "turnoNoite" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedente_biometria_horarios_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cedente_biometria_horarios_cedenteId_key" ON "cedente_biometria_horarios"("cedenteId");

-- CreateIndex
CREATE INDEX "cedente_biometria_horarios_cedenteId_idx" ON "cedente_biometria_horarios"("cedenteId");

-- AddForeignKey
ALTER TABLE "cedente_biometria_horarios" ADD CONSTRAINT "cedente_biometria_horarios_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
