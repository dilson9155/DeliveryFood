/*
  Warnings:

  - You are about to drop the column `couponCode` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `couponId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the `Coupon` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CouponUsage` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Coupon" DROP CONSTRAINT "Coupon_customerId_fkey";

-- DropForeignKey
ALTER TABLE "CouponUsage" DROP CONSTRAINT "CouponUsage_couponId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_couponId_fkey";

-- DropIndex
DROP INDEX "Order_couponId_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "couponCode",
DROP COLUMN "couponId",
ADD COLUMN     "discountByUserId" TEXT,
ADD COLUMN     "discountReason" TEXT;

-- DropTable
DROP TABLE "Coupon";

-- DropTable
DROP TABLE "CouponUsage";

-- DropEnum
DROP TYPE "CouponScope";

-- DropEnum
DROP TYPE "CouponType";

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_discountByUserId_fkey" FOREIGN KEY ("discountByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
