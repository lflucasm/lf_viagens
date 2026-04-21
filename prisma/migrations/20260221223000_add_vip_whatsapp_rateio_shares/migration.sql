-- CreateTable
CREATE TABLE "vip_whatsapp_rateio_shares" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "shareBps" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_whatsapp_rateio_shares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_vip_whatsapp_rateio_share_team_employee" ON "vip_whatsapp_rateio_shares"("team", "employeeId");

-- CreateIndex
CREATE INDEX "vip_whatsapp_rateio_shares_team_idx" ON "vip_whatsapp_rateio_shares"("team");

-- CreateIndex
CREATE INDEX "vip_whatsapp_rateio_shares_team_shareBps_idx" ON "vip_whatsapp_rateio_shares"("team", "shareBps");

-- AddForeignKey
ALTER TABLE "vip_whatsapp_rateio_shares" ADD CONSTRAINT "vip_whatsapp_rateio_shares_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
