-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "employee_payouts" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "grossProfitCents" INTEGER NOT NULL,
    "tax7Cents" INTEGER NOT NULL,
    "feeCents" INTEGER NOT NULL,
    "netPayCents" INTEGER NOT NULL,
    "breakdown" JSONB,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_payouts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employee_payouts_date_idx" ON "employee_payouts"("date");

-- CreateIndex
CREATE INDEX "employee_payouts_userId_date_idx" ON "employee_payouts"("userId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_employee_payout_day_user" ON "employee_payouts"("date", "userId");

-- AddForeignKey
ALTER TABLE "employee_payouts" ADD CONSTRAINT "employee_payouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_payouts" ADD CONSTRAINT "employee_payouts_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
