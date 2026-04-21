/*
  Warnings:

  - You are about to drop the column `senhaEmailEnc` on the `cedentes` table. All the data in the column will be lost.
  - You are about to drop the column `senhaEsferaEnc` on the `cedentes` table. All the data in the column will be lost.
  - You are about to drop the column `senhaLatamPassEnc` on the `cedentes` table. All the data in the column will be lost.
  - You are about to drop the column `senhaLiveloEnc` on the `cedentes` table. All the data in the column will be lost.
  - You are about to drop the column `senhaSmilesEnc` on the `cedentes` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "cedentes" DROP COLUMN "senhaEmailEnc",
DROP COLUMN "senhaEsferaEnc",
DROP COLUMN "senhaLatamPassEnc",
DROP COLUMN "senhaLiveloEnc",
DROP COLUMN "senhaSmilesEnc",
ADD COLUMN     "senhaEmail" TEXT,
ADD COLUMN     "senhaEsfera" TEXT,
ADD COLUMN     "senhaLatamPass" TEXT,
ADD COLUMN     "senhaLivelo" TEXT,
ADD COLUMN     "senhaSmiles" TEXT;
