CREATE TABLE "credit_card_balances" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "credit_card_balances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "credit_card_balances_team_idx" ON "credit_card_balances"("team");
