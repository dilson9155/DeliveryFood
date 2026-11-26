-- CreateTable
CREATE TABLE "PixSettings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "key" TEXT NOT NULL,
    "keyType" TEXT NOT NULL DEFAULT 'EMAIL',
    "receiverName" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PixSettings_pkey" PRIMARY KEY ("id")
);
