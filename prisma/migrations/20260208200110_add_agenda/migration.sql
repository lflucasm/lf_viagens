/*
  Warnings:

  - You are about to drop the `CaixaImediatoSnapshot` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AgendaEventType" AS ENUM ('SHIFT', 'ABSENCE');

-- CreateEnum
CREATE TYPE "AgendaEventStatus" AS ENUM ('ACTIVE', 'CANCELED');

-- CreateEnum
CREATE TYPE "AgendaAuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'SWAP');

-- AlterTable
ALTER TABLE "profit_shares" ALTER COLUMN "effectiveFrom" SET DEFAULT '2000-01-01 00:00:00'::timestamp;

-- DropTable
DROP TABLE "CaixaImediatoSnapshot";

-- CreateTable
CREATE TABLE "caixa_imediato_snapshots" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "cashCents" INTEGER NOT NULL DEFAULT 0,
    "totalBrutoCents" INTEGER NOT NULL DEFAULT 0,
    "totalDividasCents" INTEGER NOT NULL DEFAULT 0,
    "totalLiquidoCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caixa_imediato_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_events" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "type" "AgendaEventType" NOT NULL,
    "status" "AgendaEventStatus" NOT NULL DEFAULT 'ACTIVE',
    "dateISO" TEXT NOT NULL,
    "startMin" INTEGER NOT NULL,
    "endMin" INTEGER NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "canceledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_audits" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "action" "AgendaAuditAction" NOT NULL,
    "actorId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "fromStartMin" INTEGER,
    "fromEndMin" INTEGER,
    "toStartMin" INTEGER,
    "toEndMin" INTEGER,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agenda_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agenda_member_colors" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "colorHex" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agenda_member_colors_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "caixa_imediato_snapshots_team_date_idx" ON "caixa_imediato_snapshots"("team", "date");

-- CreateIndex
CREATE UNIQUE INDEX "caixa_imediato_snapshots_team_date_key" ON "caixa_imediato_snapshots"("team", "date");

-- CreateIndex
CREATE INDEX "agenda_events_team_dateISO_idx" ON "agenda_events"("team", "dateISO");

-- CreateIndex
CREATE INDEX "agenda_events_team_userId_dateISO_idx" ON "agenda_events"("team", "userId", "dateISO");

-- CreateIndex
CREATE INDEX "agenda_events_team_status_idx" ON "agenda_events"("team", "status");

-- CreateIndex
CREATE INDEX "agenda_audits_team_createdAt_idx" ON "agenda_audits"("team", "createdAt");

-- CreateIndex
CREATE INDEX "agenda_audits_team_eventId_idx" ON "agenda_audits"("team", "eventId");

-- CreateIndex
CREATE INDEX "agenda_audits_actorId_idx" ON "agenda_audits"("actorId");

-- CreateIndex
CREATE INDEX "agenda_member_colors_team_idx" ON "agenda_member_colors"("team");

-- CreateIndex
CREATE UNIQUE INDEX "uniq_agenda_member_color_team_user" ON "agenda_member_colors"("team", "userId");

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_events" ADD CONSTRAINT "agenda_events_canceledById_fkey" FOREIGN KEY ("canceledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_audits" ADD CONSTRAINT "agenda_audits_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "agenda_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_audits" ADD CONSTRAINT "agenda_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agenda_member_colors" ADD CONSTRAINT "agenda_member_colors_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
