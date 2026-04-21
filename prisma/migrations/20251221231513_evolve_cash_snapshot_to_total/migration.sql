/*
  Warnings:

  - You are about to drop the `CashSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "CashSnapshot";

-- CreateTable
CREATE TABLE "cash_snapshots" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "totalBruto" INTEGER NOT NULL,
    "totalDividas" INTEGER NOT NULL,
    "totalLiquido" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cash_snapshots_date_key" ON "cash_snapshots"("date");
