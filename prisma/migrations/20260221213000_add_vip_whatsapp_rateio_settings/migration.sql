-- CreateTable
CREATE TABLE "vip_whatsapp_rateio_settings" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "ownerPercentBps" INTEGER NOT NULL DEFAULT 7000,
    "othersPercentBps" INTEGER NOT NULL DEFAULT 3000,
    "taxPercentBps" INTEGER NOT NULL DEFAULT 1000,
    "payoutDaysCsv" TEXT NOT NULL DEFAULT '1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_whatsapp_rateio_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vip_whatsapp_rateio_settings_team_key" ON "vip_whatsapp_rateio_settings"("team");

-- CreateIndex
CREATE INDEX "vip_whatsapp_rateio_settings_team_idx" ON "vip_whatsapp_rateio_settings"("team");
