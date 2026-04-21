-- Emissões no balcão (compra e venda)
CREATE TYPE "BalcaoAirline" AS ENUM (
  'LATAM',
  'SMILES',
  'AZUL',
  'TAP',
  'IBERIA',
  'FLYING_BLUE',
  'COPA_AIRLINES',
  'UNITED'
);

CREATE TABLE "balcao_operacoes" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "airline" "BalcaoAirline" NOT NULL,
  "supplierClienteId" TEXT NOT NULL,
  "finalClienteId" TEXT NOT NULL,
  "employeeId" TEXT,
  "points" INTEGER NOT NULL,
  "buyRateCents" INTEGER NOT NULL,
  "sellRateCents" INTEGER NOT NULL,
  "boardingFeeCents" INTEGER NOT NULL DEFAULT 0,
  "supplierPayCents" INTEGER NOT NULL,
  "customerChargeCents" INTEGER NOT NULL,
  "profitCents" INTEGER NOT NULL,
  "note" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "balcao_operacoes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "balcao_operacoes_team_createdAt_idx" ON "balcao_operacoes"("team", "createdAt");
CREATE INDEX "balcao_operacoes_team_supplierClienteId_idx" ON "balcao_operacoes"("team", "supplierClienteId");
CREATE INDEX "balcao_operacoes_team_finalClienteId_idx" ON "balcao_operacoes"("team", "finalClienteId");
CREATE INDEX "balcao_operacoes_team_employeeId_idx" ON "balcao_operacoes"("team", "employeeId");

ALTER TABLE "balcao_operacoes"
  ADD CONSTRAINT "balcao_operacoes_supplierClienteId_fkey"
  FOREIGN KEY ("supplierClienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "balcao_operacoes"
  ADD CONSTRAINT "balcao_operacoes_finalClienteId_fkey"
  FOREIGN KEY ("finalClienteId") REFERENCES "clientes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "balcao_operacoes"
  ADD CONSTRAINT "balcao_operacoes_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
