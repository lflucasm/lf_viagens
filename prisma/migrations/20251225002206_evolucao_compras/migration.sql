/*
  Warnings:

  - You are about to drop the column `extraPoints` on the `purchases` table. All the data in the column will be lost.
  - You are about to drop the column `extraPointsCostCents` on the `purchases` table. All the data in the column will be lost.
  - You are about to drop the column `note` on the `purchases` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "purchases" DROP COLUMN "extraPoints",
DROP COLUMN "extraPointsCostCents",
DROP COLUMN "note",
ADD COLUMN     "ciaAerea" "LoyaltyProgram",
ADD COLUMN     "comissaoCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "custoMilheiroCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "liberadoEm" TIMESTAMP(3),
ADD COLUMN     "liberadoPorId" TEXT,
ADD COLUMN     "metaMarkupCents" INTEGER NOT NULL DEFAULT 150,
ADD COLUMN     "metaMilheiroCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "observacao" TEXT,
ADD COLUMN     "pontosCiaTotal" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "saldoAplicadoEsfera" INTEGER,
ADD COLUMN     "saldoAplicadoLatam" INTEGER,
ADD COLUMN     "saldoAplicadoLivelo" INTEGER,
ADD COLUMN     "saldoAplicadoSmiles" INTEGER,
ADD COLUMN     "saldoPrevistoEsfera" INTEGER,
ADD COLUMN     "saldoPrevistoLatam" INTEGER,
ADD COLUMN     "saldoPrevistoLivelo" INTEGER,
ADD COLUMN     "saldoPrevistoSmiles" INTEGER,
ADD COLUMN     "subtotalCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "totalCents" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "purchases_ciaAerea_idx" ON "purchases"("ciaAerea");

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_liberadoPorId_fkey" FOREIGN KEY ("liberadoPorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
