-- CreateTable
CREATE TABLE "ProductOptionGroup" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxQuantity" INTEGER NOT NULL DEFAULT 1,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductOptionGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductOption" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ProductOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItemOption" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "optionName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "OrderItemOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductOptionGroup_productId_active_order_idx" ON "ProductOptionGroup"("productId", "active", "order");

-- CreateIndex
CREATE INDEX "ProductOption_groupId_active_order_idx" ON "ProductOption"("groupId", "active", "order");

-- CreateIndex
CREATE INDEX "OrderItemOption_orderItemId_idx" ON "OrderItemOption"("orderItemId");

-- AddForeignKey
ALTER TABLE "ProductOptionGroup" ADD CONSTRAINT "ProductOptionGroup_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductOption" ADD CONSTRAINT "ProductOption_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "ProductOptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItemOption" ADD CONSTRAINT "OrderItemOption_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "OrderItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
