-- AlterTable
ALTER TABLE "receivables" RENAME CONSTRAINT "Receivable_pkey" TO "receivables_pkey";

-- AlterTable
ALTER TABLE "settings" RENAME CONSTRAINT "Settings_pkey" TO "settings_pkey";

-- CreateTable
CREATE TABLE "profit_shares" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profit_shares_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profit_share_items" (
    "id" TEXT NOT NULL,
    "shareId" TEXT NOT NULL,
    "payeeId" TEXT NOT NULL,
    "bps" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profit_share_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "profit_shares_team_idx" ON "profit_shares"("team");

-- CreateIndex
CREATE INDEX "profit_shares_ownerId_idx" ON "profit_shares"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "profit_shares_team_ownerId_key" ON "profit_shares"("team", "ownerId");

-- CreateIndex
CREATE INDEX "profit_share_items_payeeId_idx" ON "profit_share_items"("payeeId");

-- CreateIndex
CREATE UNIQUE INDEX "profit_share_items_shareId_payeeId_key" ON "profit_share_items"("shareId", "payeeId");

-- AddForeignKey
ALTER TABLE "profit_shares" ADD CONSTRAINT "profit_shares_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_share_items" ADD CONSTRAINT "profit_share_items_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "profit_shares"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profit_share_items" ADD CONSTRAINT "profit_share_items_payeeId_fkey" FOREIGN KEY ("payeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Settings_key_key" RENAME TO "settings_key_key";
