-- CreateEnum
CREATE TYPE "TermTriState" AS ENUM ('YES', 'NO', 'NO_RESPONSE');

-- CreateEnum
CREATE TYPE "TermResponseTime" AS ENUM ('H1', 'H2', 'H3', 'GT3');

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "cedente_term_reviews" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "termoVersao" TEXT NOT NULL,
    "aceiteOutros" "TermTriState",
    "aceiteLatam" "TermTriState",
    "exclusaoDef" "TermTriState",
    "responseTime" "TermResponseTime",
    "disponibilidadePoints" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedente_term_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cedente_term_reviews_termoVersao_idx" ON "cedente_term_reviews"("termoVersao");

-- CreateIndex
CREATE INDEX "cedente_term_reviews_cedenteId_idx" ON "cedente_term_reviews"("cedenteId");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_cedente_termo_versao" ON "cedente_term_reviews"("cedenteId", "termoVersao");

-- AddForeignKey
ALTER TABLE "cedente_term_reviews" ADD CONSTRAINT "cedente_term_reviews_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
