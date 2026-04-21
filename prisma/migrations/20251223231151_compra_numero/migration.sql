/*
  Warnings:

  - A unique constraint covering the columns `[numero]` on the table `purchases` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "numero" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "purchases_numero_key" ON "purchases"("numero");
