CREATE TYPE "CedenteExclusionScope" AS ENUM ('ACCOUNT', 'PROGRAM');

CREATE TABLE "cedente_exclusions" (
  "id" TEXT NOT NULL,
  "team" TEXT NOT NULL,
  "cedenteId" TEXT NOT NULL,
  "cedenteIdentificador" TEXT NOT NULL,
  "cedenteNomeCompleto" TEXT NOT NULL,
  "cedenteCpf" TEXT NOT NULL,
  "scope" "CedenteExclusionScope" NOT NULL,
  "program" "LoyaltyProgram",
  "details" JSONB,
  "deletedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cedente_exclusions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "cedente_exclusions_cedenteId_idx" ON "cedente_exclusions"("cedenteId");
CREATE INDEX "cedente_exclusions_team_createdAt_idx" ON "cedente_exclusions"("team", "createdAt");
CREATE INDEX "cedente_exclusions_scope_program_idx" ON "cedente_exclusions"("scope", "program");
CREATE INDEX "cedente_exclusions_createdAt_idx" ON "cedente_exclusions"("createdAt");

ALTER TABLE "cedente_exclusions"
ADD CONSTRAINT "cedente_exclusions_deletedById_fkey"
FOREIGN KEY ("deletedById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
