-- Admin persona: recycler_account.role, and recycler_id becomes optional so an
-- ADMIN account is not forced to belong to a recycler. Purely additive/widening:
-- every existing row gets role='RECYCLER' (its default) and keeps its existing
-- recycler_id, so no existing behaviour changes.
ALTER TABLE "recycler_account" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'RECYCLER';
ALTER TABLE "recycler_account" ALTER COLUMN "recycler_id" DROP NOT NULL;
ALTER TABLE "recycler_account" ADD CONSTRAINT "account_role_check"
  CHECK ("role" IN ('RECYCLER', 'ADMIN'));

-- The admin queue (GET /admin/flags) reads globally across every subject,
-- filtered by open/resolved and severity, newest first. flag_by_subject alone
-- doesn't serve that scan. flag_detector serves the per-detector filter.
CREATE INDEX "flag_open" ON "anomaly_flag" ("resolved_at", "severity", "created_at" DESC);
CREATE INDEX "flag_detector" ON "anomaly_flag" ("detector_code");
