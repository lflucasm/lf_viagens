-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "latamRateCents" INTEGER NOT NULL DEFAULT 2000,
    "smilesRateCents" INTEGER NOT NULL DEFAULT 1800,
    "liveloRateCents" INTEGER NOT NULL DEFAULT 2200,
    "esferaRateCents" INTEGER NOT NULL DEFAULT 1700,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Settings_key_key" ON "Settings"("key");
