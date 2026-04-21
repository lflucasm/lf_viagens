-- CreateTable
CREATE TABLE "affiliates" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "document" TEXT NOT NULL,
  "flightSalesLink" TEXT,
  "pointsPurchaseLink" TEXT,
  "commissionBps" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "affiliates_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "clientes" ADD COLUMN "affiliateId" TEXT;

-- CreateIndex
CREATE INDEX "affiliates_team_idx" ON "affiliates"("team");

-- CreateIndex
CREATE INDEX "affiliates_team_document_idx" ON "affiliates"("team", "document");

-- CreateIndex
CREATE INDEX "affiliates_team_isActive_idx" ON "affiliates"("team", "isActive");

-- CreateIndex
CREATE INDEX "clientes_affiliateId_idx" ON "clientes"("affiliateId");

-- AddForeignKey
ALTER TABLE "clientes"
  ADD CONSTRAINT "clientes_affiliateId_fkey"
  FOREIGN KEY ("affiliateId") REFERENCES "affiliates"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
