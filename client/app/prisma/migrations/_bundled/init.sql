-- CreateTable
CREATE TABLE "meta" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "value" TEXT
);

-- CreateTable
CREATE TABLE "category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "parent_code" TEXT,
    "name_en" TEXT NOT NULL,
    "name_mr" TEXT NOT NULL,
    "name_hi" TEXT NOT NULL,
    "icon_key" TEXT NOT NULL,
    "default_unit" TEXT NOT NULL,
    "critical_minerals" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "recycler" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "lat" REAL,
    "lng" REAL,
    "district" TEXT,
    "phone" TEXT,
    "authorization_status" TEXT NOT NULL,
    "validity_to" TEXT,
    "service_area_km" INTEGER NOT NULL DEFAULT 25,
    "pickup_available" BOOLEAN NOT NULL DEFAULT false,
    "materials_accepted" TEXT NOT NULL DEFAULT '[]'
);

-- CreateTable
CREATE TABLE "rate" (
    "recycler_id" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "price" REAL NOT NULL,
    "valid_from" TEXT NOT NULL,

    PRIMARY KEY ("recycler_id", "category_code")
);

-- CreateTable
CREATE TABLE "condition_factor" (
    "condition" TEXT NOT NULL PRIMARY KEY,
    "factor" REAL NOT NULL
);

-- CreateTable
CREATE TABLE "collector" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "preferred_language" TEXT NOT NULL,
    "operating_area" TEXT,
    "created_at" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "lot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "collector_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "category_code" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "quantity" REAL NOT NULL,
    "condition" TEXT NOT NULL,
    "source_type" TEXT,
    "estimated_value" REAL NOT NULL,
    "collection_lat" REAL,
    "collection_lng" REAL,
    "collection_ts" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "lot_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "collector" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "acceptance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lot_id" TEXT NOT NULL,
    "recycler_id" TEXT NOT NULL,
    "accepted_rate" REAL NOT NULL,
    "accepted_unit" TEXT NOT NULL,
    "accepted_ts" TEXT NOT NULL,
    "recycler_response" TEXT NOT NULL DEFAULT 'NONE',
    "response_ts" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "acceptance_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "handover" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lot_id" TEXT NOT NULL,
    "recycler_id" TEXT NOT NULL,
    "reference_code" TEXT NOT NULL,
    "inspected_quantity" REAL NOT NULL,
    "final_unit_price" REAL NOT NULL,
    "final_total" REAL NOT NULL,
    "inspected_condition" TEXT,
    "downgrade_reason_code" TEXT,
    "collector_protest" BOOLEAN NOT NULL DEFAULT false,
    "handover_lat" REAL,
    "handover_lng" REAL,
    "handover_ts" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "recycler_confirmed_at" TEXT,
    "collector_confirmed_at" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "handover_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "photo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lot_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "local_uri" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "uploaded_at" TEXT,
    "created_at" TEXT NOT NULL,
    CONSTRAINT "photo_lot_id_fkey" FOREIGN KEY ("lot_id") REFERENCES "lot" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "outbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "created_at" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "last_error" TEXT,
    "synced_at" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "category_code_key" ON "category"("code");

-- CreateIndex
CREATE INDEX "lot_by_created" ON "lot"("created_at");

-- CreateIndex
CREATE INDEX "acceptance_by_lot" ON "acceptance"("lot_id");

-- CreateIndex
CREATE UNIQUE INDEX "handover_lot_id_key" ON "handover"("lot_id");

-- CreateIndex
CREATE INDEX "photo_by_lot" ON "photo"("lot_id");

-- CreateIndex
CREATE INDEX "outbox_pending" ON "outbox"("synced_at", "created_at");
