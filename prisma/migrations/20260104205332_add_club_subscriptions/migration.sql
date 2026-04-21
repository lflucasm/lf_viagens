-- CreateEnum
CREATE TYPE "ClubSubscriptionStatus" AS ENUM ('ACTIVE', 'PAUSED', 'CANCELED');

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- CreateTable
CREATE TABLE "club_subscriptions" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "program" "LoyaltyProgram" NOT NULL,
    "tierK" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "subscribedAt" TIMESTAMP(3) NOT NULL,
    "renewalDay" INTEGER NOT NULL DEFAULT 1,
    "lastRenewedAt" TIMESTAMP(3),
    "pointsExpireAt" TIMESTAMP(3),
    "renewedThisCycle" BOOLEAN NOT NULL DEFAULT false,
    "status" "ClubSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "smilesBonusEligibleAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "club_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "club_subscriptions_team_program_idx" ON "club_subscriptions"("team", "program");

-- CreateIndex
CREATE INDEX "club_subscriptions_team_status_idx" ON "club_subscriptions"("team", "status");

-- CreateIndex
CREATE INDEX "club_subscriptions_cedenteId_idx" ON "club_subscriptions"("cedenteId");

-- CreateIndex
CREATE INDEX "club_subscriptions_pointsExpireAt_idx" ON "club_subscriptions"("pointsExpireAt");

-- AddForeignKey
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
