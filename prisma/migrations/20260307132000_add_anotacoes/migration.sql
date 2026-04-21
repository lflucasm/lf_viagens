-- CreateEnum
CREATE TYPE "AnotacaoStatus" AS ENUM ('PENDENTE', 'RESOLVIDO');

-- CreateTable
CREATE TABLE "anotacoes" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "status" "AnotacaoStatus" NOT NULL DEFAULT 'PENDENTE',
    "cedenteId" TEXT NOT NULL,
    "texto" TEXT NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "anotacoes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "anotacoes_team_status_idx" ON "anotacoes"("team", "status");

-- CreateIndex
CREATE INDEX "anotacoes_team_resolvedAt_idx" ON "anotacoes"("team", "resolvedAt");

-- CreateIndex
CREATE INDEX "anotacoes_team_createdAt_idx" ON "anotacoes"("team", "createdAt");

-- CreateIndex
CREATE INDEX "anotacoes_cedenteId_idx" ON "anotacoes"("cedenteId");

-- AddForeignKey
ALTER TABLE "anotacoes"
ADD CONSTRAINT "anotacoes_cedenteId_fkey"
FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "anotacoes"
ADD CONSTRAINT "anotacoes_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
