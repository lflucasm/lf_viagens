-- CreateEnum
CREATE TYPE "CedenteStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "login" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cpf" TEXT,
    "email" TEXT,
    "team" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedentes" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "nomeCompleto" TEXT NOT NULL,
    "dataNascimento" TIMESTAMP(3),
    "cpf" TEXT NOT NULL,
    "emailCriado" TEXT,
    "chavePix" TEXT,
    "banco" TEXT,
    "senhaEmailEnc" TEXT,
    "senhaSmilesEnc" TEXT,
    "senhaLatamPassEnc" TEXT,
    "senhaLiveloEnc" TEXT,
    "senhaEsferaEnc" TEXT,
    "pontosLatam" INTEGER NOT NULL DEFAULT 0,
    "pontosSmiles" INTEGER NOT NULL DEFAULT 0,
    "pontosLivelo" INTEGER NOT NULL DEFAULT 0,
    "pontosEsfera" INTEGER NOT NULL DEFAULT 0,
    "status" "CedenteStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cedentes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_invites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cedente_term_acceptances" (
    "id" TEXT NOT NULL,
    "cedenteId" TEXT NOT NULL,
    "termoVersao" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cedente_term_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_login_key" ON "User"("login");

-- CreateIndex
CREATE UNIQUE INDEX "User_cpf_key" ON "User"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "cedentes_identificador_key" ON "cedentes"("identificador");

-- CreateIndex
CREATE UNIQUE INDEX "cedentes_cpf_key" ON "cedentes"("cpf");

-- CreateIndex
CREATE INDEX "cedentes_status_idx" ON "cedentes"("status");

-- CreateIndex
CREATE INDEX "cedentes_ownerId_idx" ON "cedentes"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_userId_key" ON "employee_invites"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "employee_invites_code_key" ON "employee_invites"("code");

-- CreateIndex
CREATE INDEX "cedente_term_acceptances_cedenteId_idx" ON "cedente_term_acceptances"("cedenteId");

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedentes" ADD CONSTRAINT "cedentes_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_invites" ADD CONSTRAINT "employee_invites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cedente_term_acceptances" ADD CONSTRAINT "cedente_term_acceptances_cedenteId_fkey" FOREIGN KEY ("cedenteId") REFERENCES "cedentes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
