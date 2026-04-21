ALTER TABLE "cedente_exclusions"
ADD COLUMN "restoredAt" TIMESTAMP(3),
ADD COLUMN "restoredById" TEXT,
ADD COLUMN "restoreDetails" JSONB;

CREATE INDEX "cedente_exclusions_restoredAt_idx" ON "cedente_exclusions"("restoredAt");

ALTER TABLE "cedente_exclusions"
ADD CONSTRAINT "cedente_exclusions_restoredById_fkey"
FOREIGN KEY ("restoredById") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
