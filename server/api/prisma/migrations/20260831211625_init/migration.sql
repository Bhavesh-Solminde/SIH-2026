-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateTable
CREATE TABLE "collector" (
    "id" UUID NOT NULL,
    "preferred_language" TEXT NOT NULL,
    "operating_area" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycler" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "type" TEXT NOT NULL,
    "capacity_mta" INTEGER,
    "registration_no" TEXT NOT NULL,
    "validity_to" DATE,
    "authorization_status" TEXT NOT NULL,
    "district" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "service_area_km" INTEGER NOT NULL DEFAULT 25,
    "pickup_available" BOOLEAN NOT NULL DEFAULT false,
    "materials_accepted" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recycler_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "category" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "code" TEXT NOT NULL,
    "parent_id" UUID,
    "name_en" TEXT NOT NULL,
    "name_mr" TEXT NOT NULL,
    "name_hi" TEXT NOT NULL,
    "icon_key" TEXT NOT NULL,
    "default_unit" TEXT NOT NULL,
    "critical_minerals" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expected_qty_min" DECIMAL(10,3),
    "expected_qty_max" DECIMAL(10,3),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recycler_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "unit" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "source" TEXT NOT NULL,
    "location" TEXT,
    "valid_from" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lot" (
    "id" UUID NOT NULL,
    "collector_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL,
    "condition" TEXT NOT NULL,
    "source_type" TEXT,
    "estimated_value" DECIMAL(12,2) NOT NULL,
    "collection_lat" DOUBLE PRECISION,
    "collection_lng" DOUBLE PRECISION,
    "collection_ts" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "condition_factor" (
    "condition" TEXT NOT NULL,
    "factor" DECIMAL(4,3) NOT NULL,

    CONSTRAINT "condition_factor_pkey" PRIMARY KEY ("condition")
);

-- CreateTable
CREATE TABLE "acceptance" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "recycler_id" UUID NOT NULL,
    "accepted_rate" DECIMAL(12,2) NOT NULL,
    "accepted_unit" TEXT NOT NULL,
    "accepted_ts" TIMESTAMPTZ(6) NOT NULL,
    "recycler_response" TEXT NOT NULL DEFAULT 'NONE',
    "response_ts" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "handover" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "recycler_id" UUID NOT NULL,
    "reference_code" TEXT NOT NULL,
    "inspected_quantity" DECIMAL(10,3) NOT NULL,
    "final_unit_price" DECIMAL(12,2) NOT NULL,
    "final_total" DECIMAL(12,2) NOT NULL,
    "inspected_condition" TEXT,
    "downgrade_reason_code" TEXT,
    "collector_protest" BOOLEAN NOT NULL DEFAULT false,
    "handover_lat" DOUBLE PRECISION,
    "handover_lng" DOUBLE PRECISION,
    "handover_ts" TIMESTAMPTZ(6) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_COLLECTOR',
    "recycler_confirmed_at" TIMESTAMPTZ(6),
    "collector_confirmed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "handover_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "photo" (
    "id" UUID NOT NULL,
    "lot_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "anomaly_flag" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "detector_code" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "config_version" TEXT,
    "admin_outcome" TEXT,
    "run_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "anomaly_flag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycler_account" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "recycler_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recycler_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recycler_session" (
    "token" TEXT NOT NULL,
    "account_id" UUID NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recycler_session_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "recycler_registration_no_key" ON "recycler"("registration_no");

-- CreateIndex
CREATE INDEX "recycler_authorization_status_idx" ON "recycler"("authorization_status");

-- CreateIndex
CREATE UNIQUE INDEX "category_code_key" ON "category"("code");

-- CreateIndex
CREATE INDEX "rate_lookup" ON "rate"("recycler_id", "category_id", "valid_from" DESC);

-- CreateIndex
CREATE INDEX "lot_by_collector" ON "lot"("collector_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "acceptance_by_lot" ON "acceptance"("lot_id");

-- CreateIndex
CREATE INDEX "acceptance_by_recy" ON "acceptance"("recycler_id", "accepted_ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "handover_lot_id_key" ON "handover"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "handover_reference_code_key" ON "handover"("reference_code");

-- CreateIndex
CREATE INDEX "handover_by_recy" ON "handover"("recycler_id", "handover_ts" DESC);

-- CreateIndex
CREATE INDEX "photo_by_lot" ON "photo"("lot_id");

-- CreateIndex
CREATE INDEX "flag_by_subject" ON "anomaly_flag"("subject_type", "subject_id");

-- CreateIndex
CREATE UNIQUE INDEX "recycler_account_email_key" ON "recycler_account"("email");

-- CreateIndex
CREATE INDEX "recycler_session_account_id_idx" ON "recycler_session"("account_id");

-- AddForeignKey
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate" ADD CONSTRAINT "rate_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "recycler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rate" ADD CONSTRAINT "rate_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "collector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lot" ADD CONSTRAINT "lot_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acceptance" ADD CONSTRAINT "acceptance_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "recycler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover" ADD CONSTRAINT "handover_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "handover" ADD CONSTRAINT "handover_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "recycler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo" ADD CONSTRAINT "photo_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycler_account" ADD CONSTRAINT "recycler_account_recycler_id_fkey" FOREIGN KEY ("recycler_id") REFERENCES "recycler"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recycler_session" ADD CONSTRAINT "recycler_session_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "recycler_account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
