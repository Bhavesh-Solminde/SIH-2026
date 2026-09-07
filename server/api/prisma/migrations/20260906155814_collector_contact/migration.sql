-- CreateTable
CREATE TABLE "collector_contact" (
    "collector_id" UUID NOT NULL,
    "phone" TEXT NOT NULL,
    "consent_ts" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collector_contact_pkey" PRIMARY KEY ("collector_id")
);

-- AddForeignKey
ALTER TABLE "collector_contact" ADD CONSTRAINT "collector_contact_collector_id_fkey" FOREIGN KEY ("collector_id") REFERENCES "collector"("id") ON DELETE CASCADE ON UPDATE CASCADE;
