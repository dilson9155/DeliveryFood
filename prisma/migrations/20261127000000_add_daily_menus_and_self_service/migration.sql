-- CreateEnum
CREATE TYPE "SelfServiceMode" AS ENUM ('BY_WEIGHT', 'FIXED');

-- CreateSequence
CREATE SEQUENCE self_service_sale_number_seq;

-- AlterTable
ALTER TABLE "OrderItem"
    ADD COLUMN "dailyMenuMealId" TEXT,
    ADD COLUMN "dailyMenuSizeId" TEXT;

-- CreateIndex
CREATE INDEX "OrderItem_dailyMenuMealId_idx" ON "OrderItem"("dailyMenuMealId");

-- AlterTable
ALTER TABLE "Settings"
    ADD COLUMN "selfServicePricePerKg" DOUBLE PRECISION NOT NULL DEFAULT 0,
    ADD COLUMN "selfServiceFixedPrice" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "DailyMenu" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "date" TEXT NOT NULL,
    "title" VARCHAR(120),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMenuMeal" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "menuId" TEXT NOT NULL,
    "name" VARCHAR(120) NOT NULL,
    "description" VARCHAR(500),
    "imageUrl" TEXT,
    "availableQty" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyMenuMeal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMenuSize" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "menuId" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "description" VARCHAR(200),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyMenuSize_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMenuMealPrice" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "mealId" TEXT NOT NULL,
    "sizeId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "DailyMenuMealPrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelfServiceSale" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "number" INTEGER NOT NULL DEFAULT nextval('self_service_sale_number_seq'),
    "mode" "SelfServiceMode" NOT NULL,
    "weightGrams" DOUBLE PRECISION,
    "pricePerKg" DOUBLE PRECISION,
    "people" INTEGER,
    "pricePerPerson" DOUBLE PRECISION,
    "total" DOUBLE PRECISION NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "paidNow" BOOLEAN NOT NULL DEFAULT true,
    "customerId" TEXT,
    "operatorId" TEXT NOT NULL,
    "orderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SelfServiceSale_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyMenu_date_key" ON "DailyMenu"("date");
CREATE INDEX "DailyMenu_active_date_idx" ON "DailyMenu"("active", "date");
CREATE INDEX "DailyMenuMeal_menuId_active_order_idx" ON "DailyMenuMeal"("menuId", "active", "order");
CREATE INDEX "DailyMenuSize_menuId_active_order_idx" ON "DailyMenuSize"("menuId", "active", "order");
CREATE UNIQUE INDEX "DailyMenuMealPrice_mealId_sizeId_key" ON "DailyMenuMealPrice"("mealId", "sizeId");
CREATE INDEX "DailyMenuMealPrice_sizeId_idx" ON "DailyMenuMealPrice"("sizeId");
CREATE UNIQUE INDEX "SelfServiceSale_number_key" ON "SelfServiceSale"("number");
CREATE UNIQUE INDEX "SelfServiceSale_orderId_key" ON "SelfServiceSale"("orderId");
CREATE INDEX "SelfServiceSale_createdAt_idx" ON "SelfServiceSale"("createdAt");
CREATE INDEX "SelfServiceSale_customerId_idx" ON "SelfServiceSale"("customerId");

-- AddForeignKey
ALTER TABLE "DailyMenuMeal" ADD CONSTRAINT "DailyMenuMeal_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "DailyMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMenuSize" ADD CONSTRAINT "DailyMenuSize_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "DailyMenu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMenuMealPrice" ADD CONSTRAINT "DailyMenuMealPrice_mealId_fkey" FOREIGN KEY ("mealId") REFERENCES "DailyMenuMeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DailyMenuMealPrice" ADD CONSTRAINT "DailyMenuMealPrice_sizeId_fkey" FOREIGN KEY ("sizeId") REFERENCES "DailyMenuSize"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SelfServiceSale" ADD CONSTRAINT "SelfServiceSale_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SelfServiceSale" ADD CONSTRAINT "SelfServiceSale_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SelfServiceSale" ADD CONSTRAINT "SelfServiceSale_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sequence ownership
ALTER SEQUENCE self_service_sale_number_seq OWNED BY "SelfServiceSale"."number";
