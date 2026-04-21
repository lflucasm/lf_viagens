/*
  Warnings:

  - Added the required column `updatedAt` to the `cash_snapshots` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "cash_snapshots" ADD COLUMN     "cashCents" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "cash_snapshots_date_idx" ON "cash_snapshots"("date");
