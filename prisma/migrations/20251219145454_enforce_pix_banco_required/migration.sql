/*
  Warnings:

  - Made the column `chavePix` on table `cedentes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `banco` on table `cedentes` required. This step will fail if there are existing NULL values in that column.
  - Made the column `pixTipo` on table `cedentes` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "cedentes" ALTER COLUMN "chavePix" SET NOT NULL,
ALTER COLUMN "banco" SET NOT NULL,
ALTER COLUMN "pixTipo" SET NOT NULL,
ALTER COLUMN "titularConfirmado" SET DEFAULT true;
