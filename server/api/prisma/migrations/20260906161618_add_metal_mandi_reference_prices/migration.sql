-- CreateTable
CREATE TABLE "metal_mandi_reference_price" (
    "id" TEXT NOT NULL,
    "reference_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "specification" TEXT,
    "unit" TEXT NOT NULL,
    "reference_price" DECIMAL(12,2) NOT NULL,
    "price_change_pct" DECIMAL(8,2),
    "critical_materials" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imported_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metal_mandi_reference_price_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category_reference_price" (
    "id" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(12,2),
    "resolved_ref_id" TEXT,
    "candidate_source_ref_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,

    CONSTRAINT "category_reference_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "metal_mandi_reference_price_reference_id_key" ON "metal_mandi_reference_price"("reference_id");

-- CreateIndex
CREATE INDEX "metal_mandi_reference_price_category_idx" ON "metal_mandi_reference_price"("category");

-- CreateIndex
CREATE UNIQUE INDEX "category_reference_price_category_code_key" ON "category_reference_price"("category_code");

-- CreateIndex
CREATE INDEX "category_reference_price_resolved_ref_id_idx" ON "category_reference_price"("resolved_ref_id");

-- CreateIndex
CREATE INDEX "recycler_authorization_status_idx" ON "recycler"("authorization_status");

-- AddForeignKey
ALTER TABLE "category_reference_price" ADD CONSTRAINT "category_reference_price_resolved_ref_id_fkey" FOREIGN KEY ("resolved_ref_id") REFERENCES "metal_mandi_reference_price"("reference_id") ON DELETE SET NULL ON UPDATE CASCADE;
