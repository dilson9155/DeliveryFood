-- CreateEnum
CREATE TYPE "ComandaStatus" AS ENUM ('OPEN', 'CLOSED', 'CANCELLED');

-- CreateSequence
DROP SEQUENCE IF EXISTS comanda_number_seq;
CREATE SEQUENCE comanda_number_seq;

-- CreateTable
CREATE TABLE "RestaurantTable" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "number" INTEGER NOT NULL,
    "label" TEXT,
    "seats" INTEGER NOT NULL DEFAULT 2,
    "area" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RestaurantTable_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comanda" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "number" INTEGER NOT NULL DEFAULT nextval('comanda_number_seq'),
    "tableId" TEXT NOT NULL,
    "customerId" TEXT,
    "customerName" TEXT,
    "status" "ComandaStatus" NOT NULL DEFAULT 'OPEN',
    "observation" TEXT,
    "paymentMethod" "PaymentMethod",
    "paidNow" BOOLEAN NOT NULL DEFAULT false,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "openedBy" TEXT NOT NULL,
    "closedBy" TEXT,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comanda_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComandaItem" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "comandaId" TEXT NOT NULL,
    "productId" TEXT,
    "productName" TEXT NOT NULL,
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL,
    "subtotal" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComandaItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComandaItemOption" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "comandaItemId" TEXT NOT NULL,
    "groupId" TEXT,
    "optionId" TEXT,
    "groupName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ComandaItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RestaurantTable_number_key" ON "RestaurantTable"("number");
CREATE INDEX "RestaurantTable_active_number_idx" ON "RestaurantTable"("active", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Comanda_number_key" ON "Comanda"("number");
CREATE UNIQUE INDEX "Comanda_orderId_key" ON "Comanda"("orderId");
CREATE INDEX "Comanda_status_openedAt_idx" ON "Comanda"("status", "openedAt");
CREATE INDEX "Comanda_tableId_status_idx" ON "Comanda"("tableId", "status");
CREATE UNIQUE INDEX "Comanda_tableId_open_key" ON "Comanda"("tableId") WHERE "status" = 'OPEN';

-- CreateIndex
CREATE INDEX "ComandaItem_comandaId_idx" ON "ComandaItem"("comandaId");
CREATE INDEX "ComandaItem_productId_idx" ON "ComandaItem"("productId");

-- CreateIndex
CREATE INDEX "ComandaItemOption_comandaItemId_idx" ON "ComandaItemOption"("comandaItemId");

-- AddForeignKey
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_tableId_fkey" FOREIGN KEY ("tableId") REFERENCES "RestaurantTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_openedBy_fkey" FOREIGN KEY ("openedBy") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_closedBy_fkey" FOREIGN KEY ("closedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Comanda" ADD CONSTRAINT "Comanda_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_comandaId_fkey" FOREIGN KEY ("comandaId") REFERENCES "Comanda"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComandaItem" ADD CONSTRAINT "ComandaItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComandaItemOption" ADD CONSTRAINT "ComandaItemOption_comandaItemId_fkey" FOREIGN KEY ("comandaItemId") REFERENCES "ComandaItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mesas iniciais do salão
INSERT INTO "RestaurantTable" ("number", "label", "seats", "area", "active", "createdAt", "updatedAt")
SELECT n, format('Mesa %s', lpad(n::text, 2, '0')), 4, 'Salão', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM generate_series(1, 12) AS n
WHERE NOT EXISTS (SELECT 1 FROM "RestaurantTable");
