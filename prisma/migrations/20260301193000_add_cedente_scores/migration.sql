-- CreateTable
CREATE TABLE "cedente_scores" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "rapidezBiometria" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rapidezSms" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "resolucaoProblema" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confianca" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedente_scores_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cedente_scores_cedenteId_key" ON "cedente_scores"("cedenteId");

-- CreateIndex
CREATE INDEX "cedente_scores_updatedAt_idx" ON "cedente_scores"("updatedAt");

-- AddForeignKey
ALTER TABLE "cedente_scores"
ADD CONSTRAINT "cedente_scores_cedenteId_fkey"
FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
