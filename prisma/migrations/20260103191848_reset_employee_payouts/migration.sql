/*
  Warnings:

  - A unique constraint covering the columns `[team,date,userId]` on the table `employee_payouts` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `team` to the `employee_payouts` table without a default value. This is not possible if the table is not empty.

*/
-- DropIndex
DROP INDEX "employee_payouts_date_idx";

-- DropIndex
DROP INDEX "uniq_employee_payout_day_user";

-- AlterTable
ALTER TABLE "employee_payouts" ADD COLUMN     "team" TEXT NOT NULL,
ALTER COLUMN "date" SET DATA TYPE TEXT,
ALTER COLUMN "grossProfitCents" SET DEFAULT 0,
ALTER COLUMN "tax7Cents" SET DEFAULT 0,
ALTER COLUMN "feeCents" SET DEFAULT 0,
ALTER COLUMN "netPayCents" SET DEFAULT 0,
ALTER COLUMN "paidAt" DROP NOT NULL,
ALTER COLUMN "paidAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateIndex
CREATE INDEX "employee_payouts_team_date_idx" ON "employee_payouts"("team", "date");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_employee_payout_team_day_user" ON "employee_payouts"("team", "date", "userId");
