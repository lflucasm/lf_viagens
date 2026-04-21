/*
  Warnings:

  - A unique constraint covering the columns `[team,ownerId,effectiveFrom]` on the table `profit_shares` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "profit_shares_team_ownerId_key";

-- AlterTable
ALTER TABLE "profit_shares" ADD COLUMN     "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00'::timestamp,
ADD COLUMN     "effectiveTo" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "profit_shares_team_ownerId_effectiveFrom_idx" ON "profit_shares"("team", "ownerId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "profit_shares_team_ownerId_effectiveTo_idx" ON "profit_shares"("team", "ownerId", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_profitshare_owner_from" ON "profit_shares"("team", "ownerId", "effectiveFrom");
