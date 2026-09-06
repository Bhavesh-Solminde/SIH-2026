-- AlterTable
ALTER TABLE "handover" ADD COLUMN     "buyer_offer_snapshot" DECIMAL(12,2),
ADD COLUMN     "buyer_offer_unit" TEXT,
ADD COLUMN     "reference_price_snapshot" DECIMAL(12,2),
ADD COLUMN     "reference_price_status" TEXT,
ADD COLUMN     "reference_price_unit" TEXT;
