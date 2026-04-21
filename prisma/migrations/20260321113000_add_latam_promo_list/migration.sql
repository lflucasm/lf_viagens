CREATE TYPE "LatamPromoListStatus" AS ENUM ('PENDING', 'ELIGIBLE', 'DENIED', 'USED');

CREATE TABLE "latam_promo_list_items" (
    "id" TEXT NOT NULL,
    "team" TEXT NOT NULL,
    "listDate" TEXT NOT NULL,
    "status" "LatamPromoListStatus" NOT NULL DEFAULT 'PENDING',
    "cedenteId" TEXT NOT NULL,
    "addedById" TEXT,
    "reviewedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "latam_promo_list_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "latam_promo_list_items_team_listDate_cedenteId_key"
ON "latam_promo_list_items"("team", "listDate", "cedenteId");

CREATE INDEX "latam_promo_list_items_team_listDate_status_idx"
ON "latam_promo_list_items"("team", "listDate", "status");

CREATE INDEX "latam_promo_list_items_cedenteId_idx"
ON "latam_promo_list_items"("cedenteId");

CREATE INDEX "latam_promo_list_items_addedById_idx"
ON "latam_promo_list_items"("addedById");

CREATE INDEX "latam_promo_list_items_reviewedById_idx"
ON "latam_promo_list_items"("reviewedById");

ALTER TABLE "latam_promo_list_items"
ADD CONSTRAINT "latam_promo_list_items_cedenteId_fkey"
FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "latam_promo_list_items"
ADD CONSTRAINT "latam_promo_list_items_addedById_fkey"
FOREIGN KEY ("addedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "latam_promo_list_items"
ADD CONSTRAINT "latam_promo_list_items_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
