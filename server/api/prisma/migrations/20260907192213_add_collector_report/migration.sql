-- CreateTable
CREATE TABLE "collector_report" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "handover_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collector_report_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collector_report_handover_id_idx" ON "collector_report"("handover_id");

-- AddForeignKey
ALTER TABLE "collector_report" ADD CONSTRAINT "collector_report_handover_id_fkey" FOREIGN KEY ("handover_id") REFERENCES "handover"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
