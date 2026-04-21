-- CreateEnum
CREATE TYPE "VipWhatsappLeadStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "vip_whatsapp_links" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "whatsappE164" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_whatsapp_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_whatsapp_leads" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "countryCode" TEXT NOT NULL,
    "areaCode" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "whatsappE164" TEXT NOT NULL,
    "originAirport" TEXT NOT NULL,
    "destinationAirport1" TEXT NOT NULL,
    "destinationAirport2" TEXT NOT NULL,
    "destinationAirport3" TEXT NOT NULL,
    "firstMonthCents" INTEGER NOT NULL DEFAULT 990,
    "recurringMonthCents" INTEGER NOT NULL DEFAULT 1490,
    "status" "VipWhatsappLeadStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "internalNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_whatsapp_leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vip_whatsapp_payments" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "monthRef" TEXT,
    "amountCents" INTEGER NOT NULL,
    "note" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vip_whatsapp_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "vip_whatsapp_links_code_key" ON "vip_whatsapp_links"("code");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_vip_whatsapp_link_team_employee" ON "vip_whatsapp_links"("team", "employeeId");

-- CreateIndex
CREATE INDEX "vip_whatsapp_links_team_isActive_idx" ON "vip_whatsapp_links"("team", "isActive");

-- CreateIndex
CREATE INDEX "vip_whatsapp_links_team_code_idx" ON "vip_whatsapp_links"("team", "code");

-- CreateIndex
CREATE INDEX "vip_whatsapp_leads_team_status_createdAt_idx" ON "vip_whatsapp_leads"("team", "status", "createdAt");

-- CreateIndex
CREATE INDEX "vip_whatsapp_leads_employeeId_createdAt_idx" ON "vip_whatsapp_leads"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "vip_whatsapp_leads_linkId_idx" ON "vip_whatsapp_leads"("linkId");

-- CreateIndex
CREATE INDEX "vip_whatsapp_payments_team_paidAt_idx" ON "vip_whatsapp_payments"("team", "paidAt");

-- CreateIndex
CREATE INDEX "vip_whatsapp_payments_leadId_paidAt_idx" ON "vip_whatsapp_payments"("leadId", "paidAt");

-- AddForeignKey
ALTER TABLE "vip_whatsapp_links" ADD CONSTRAINT "vip_whatsapp_links_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_whatsapp_leads" ADD CONSTRAINT "vip_whatsapp_leads_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "vip_whatsapp_links"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_whatsapp_leads" ADD CONSTRAINT "vip_whatsapp_leads_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_whatsapp_leads" ADD CONSTRAINT "vip_whatsapp_leads_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_whatsapp_payments" ADD CONSTRAINT "vip_whatsapp_payments_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "vip_whatsapp_leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vip_whatsapp_payments" ADD CONSTRAINT "vip_whatsapp_payments_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
