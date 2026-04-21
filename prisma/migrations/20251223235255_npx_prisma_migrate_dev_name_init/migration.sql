-- AlterTable
ALTER TABLE "purchases" ALTER COLUMN "numero" DROP DEFAULT,
ALTER COLUMN "numero" SET DATA TYPE TEXT;
DROP SEQUENCE "purchases_numero_seq";

-- CreateTable
CREATE TABLE "counters" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counters_pkey" PRIMARY KEY ("key")
);
