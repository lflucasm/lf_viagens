-- CreateTable
CREATE TABLE "app_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "companyDisplayName" TEXT NOT NULL DEFAULT 'LF Viagens',
    "companyLegalName" TEXT NOT NULL DEFAULT 'VIAS AÉREAS VIAGENS E TURISMO LTDA',
    "cnpj" TEXT NOT NULL DEFAULT '63.817.773/0001-85',
    "instagramHandle" TEXT NOT NULL DEFAULT 'viasaereastrip',
    "phoneDisplay" TEXT NOT NULL DEFAULT '(53) 99976-0707',
    "whatsappDigits" TEXT NOT NULL DEFAULT '5553999760707',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedente_indicacao_forms" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "termVersion" TEXT NOT NULL,
    "termBody" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cedente_indicacao_forms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "cedente_indicacao_forms_slug_key" ON "cedente_indicacao_forms"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "cedente_indicacao_forms_termVersion_key" ON "cedente_indicacao_forms"("termVersion");

-- CreateIndex
CREATE INDEX "cedente_indicacao_forms_isActive_sortOrder_idx" ON "cedente_indicacao_forms"("isActive", "sortOrder");

INSERT INTO "app_settings" ("id")
VALUES ('default')
ON CONFLICT ("id") DO NOTHING;
