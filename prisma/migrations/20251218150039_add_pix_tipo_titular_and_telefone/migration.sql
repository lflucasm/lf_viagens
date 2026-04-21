-- CreateEnum
CREATE TYPE "PixTipo" AS ENUM ('CPF', 'CNPJ', 'EMAIL', 'TELEFONE', 'ALEATORIA');

-- AlterTable
ALTER TABLE "cedentes" ADD COLUMN     "pixTipo" "PixTipo",
ADD COLUMN     "titularConfirmado" BOOLEAN NOT NULL DEFAULT false;
