-- AlterTable
ALTER TABLE "Order"
ADD COLUMN     "recipientName" TEXT,
ADD COLUMN     "recipientPhone" TEXT,
ADD COLUMN     "recipientAddress" VARCHAR(300);
