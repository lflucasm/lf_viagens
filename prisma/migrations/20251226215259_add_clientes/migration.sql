-- CreateEnum
CREATE TYPE "ClienteTipo" AS ENUM ('PESSOA', 'EMPRESA');

-- CreateEnum
CREATE TYPE "ClienteOrigem" AS ENUM ('BALCAO_MILHAS', 'PARTICULAR', 'SITE', 'OUTROS');

-- CreateTable
CREATE TABLE "clientes" (
    "id" TEXT NOT NULL,
    "identificador" TEXT NOT NULL,
    "tipo" "ClienteTipo" NOT NULL DEFAULT 'PESSOA',
    "nome" TEXT NOT NULL,
    "cpfCnpj" TEXT,
    "telefone" TEXT,
    "origem" "ClienteOrigem" NOT NULL,
    "origemDescricao" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clientes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clientes_identificador_key" ON "clientes"("identificador");

-- CreateIndex
CREATE INDEX "clientes_origem_idx" ON "clientes"("origem");

-- CreateIndex
CREATE INDEX "clientes_createdAt_idx" ON "clientes"("createdAt");

-- AddForeignKey
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
