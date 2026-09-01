-- Controlled vocabularies are text + CHECK, not Postgres enum (DB.md section 2):
-- enums are painful to extend and these will grow.

ALTER TABLE collector
  ADD CONSTRAINT collector_language_check CHECK (preferred_language IN ('mr','hi'));

ALTER TABLE recycler
  ADD CONSTRAINT recycler_type_check CHECK (type IN ('RECYCLER','DISMANTLER')),
  ADD CONSTRAINT recycler_auth_check CHECK (authorization_status IN ('VALID','LAPSED_IN_LIST'));

ALTER TABLE category
  ADD CONSTRAINT category_unit_check CHECK (default_unit IN ('KG','PIECE'));

ALTER TABLE rate
  ADD CONSTRAINT rate_unit_check CHECK (unit IN ('KG','PIECE')),
  ADD CONSTRAINT rate_price_check CHECK (price >= 0),
  ADD CONSTRAINT rate_source_check
    CHECK (source IN ('RECYCLER_PUBLISHED','FIELD_COLLECTED','MARKET_INDICATIVE'));

ALTER TABLE lot
  ADD CONSTRAINT lot_unit_check CHECK (unit IN ('KG','PIECE')),
  ADD CONSTRAINT lot_quantity_check CHECK (quantity > 0),
  ADD CONSTRAINT lot_condition_check CHECK (condition IN ('GOOD','FAIR','POOR')),
  ADD CONSTRAINT lot_source_type_check
    CHECK (source_type IS NULL OR source_type IN
           ('HOUSEHOLD','SHOP','OFFICE','INSTITUTIONAL','STREET','OTHER')),
  ADD CONSTRAINT lot_estimated_value_check CHECK (estimated_value >= 0),
  ADD CONSTRAINT lot_status_check
    CHECK (status IN ('DRAFT','ACCEPTED','HANDED_OVER','CANCELLED'));

ALTER TABLE condition_factor
  ADD CONSTRAINT condition_factor_condition_check CHECK (condition IN ('GOOD','FAIR','POOR')),
  ADD CONSTRAINT condition_factor_factor_check CHECK (factor > 0 AND factor <= 1);

ALTER TABLE acceptance
  ADD CONSTRAINT acceptance_unit_check CHECK (accepted_unit IN ('KG','PIECE')),
  ADD CONSTRAINT acceptance_response_check
    CHECK (recycler_response IN ('NONE','ACKNOWLEDGED','DECLINED'));

ALTER TABLE handover
  ADD CONSTRAINT handover_quantity_check CHECK (inspected_quantity > 0),
  ADD CONSTRAINT handover_unit_price_check CHECK (final_unit_price >= 0),
  ADD CONSTRAINT handover_total_check CHECK (final_total >= 0),
  ADD CONSTRAINT handover_status_check
    CHECK (status IN ('PENDING_COLLECTOR','CONFIRMED','DISPUTED')),
  ADD CONSTRAINT handover_inspected_condition_check
    CHECK (inspected_condition IS NULL OR inspected_condition IN ('GOOD','FAIR','POOR')),
  ADD CONSTRAINT handover_downgrade_reason_check
    CHECK (downgrade_reason_code IS NULL OR downgrade_reason_code IN
           ('POOR_CONDITION','MIXED_GRADE','LOW_RECOVERABLE','TRANSPORT_DISTANCE',
            'BULK_DISCOUNT','LOCAL_RATE_LOWER','OTHER'));

-- THE PROJECT'S HEADLINE INTEGRITY CLAIM (DB.md section 3.7).
-- A handover cannot reach CONFIRMED without both parties' signatures, and the
-- database enforces it rather than a route handler that holds only as long as
-- someone remembers it.
--
-- This permits the legitimate intermediate state in which the recycler has
-- submitted and the collector has not yet confirmed. An earlier draft in
-- SERVER.md required both timestamps null or both set, which would have
-- blocked the real flow.
ALTER TABLE handover
  ADD CONSTRAINT handover_confirmed_needs_both_signatures CHECK (
    status <> 'CONFIRMED'
    OR (recycler_confirmed_at IS NOT NULL AND collector_confirmed_at IS NOT NULL)
  );

ALTER TABLE photo
  ADD CONSTRAINT photo_kind_check CHECK (kind IN ('LOT','HANDOVER')),
  ADD CONSTRAINT photo_bytes_check CHECK (bytes > 0);

ALTER TABLE anomaly_flag
  ADD CONSTRAINT anomaly_subject_type_check
    CHECK (subject_type IN ('LOT','HANDOVER','RECYCLER','COLLECTOR','MARKET')),
  ADD CONSTRAINT anomaly_severity_check CHECK (severity IN ('INFO','WARN','CRITICAL')),
  ADD CONSTRAINT anomaly_admin_outcome_check
    CHECK (admin_outcome IS NULL OR admin_outcome IN
           ('JUSTIFIED','SUSPICIOUS','DISPUTED','UNRESOLVED','INVALID'));

-- rate is APPEND ONLY (DB.md section 1, rule 2). Overwrite a rate once and the
-- history is gone permanently: price trends, bait-price detection and "what
-- was the rate when they accepted" all become impossible. A rule this
-- irreversible does not live in a code review.
CREATE OR REPLACE FUNCTION rate_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'rate is append-only: insert a new row, never UPDATE or DELETE (DB.md 1.2)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER rate_no_update BEFORE UPDATE OR DELETE ON rate
  FOR EACH ROW EXECUTE FUNCTION rate_is_append_only();

-- "Current rate" is always a query, never a column (DB.md section 3.4).
-- Use this view everywhere, including /sync/bootstrap.
CREATE VIEW current_rate AS
SELECT DISTINCT ON (recycler_id, category_id)
       recycler_id, category_id, unit, price, valid_from
FROM rate
WHERE source = 'RECYCLER_PUBLISHED'
ORDER BY recycler_id, category_id, valid_from DESC;

-- DB.md section 4. Prisma emits a plain index on authorization_status; the
-- partial index is the one the hot path actually wants.
DROP INDEX IF EXISTS "recycler_authorization_status_idx";
CREATE INDEX recycler_valid ON recycler (authorization_status)
  WHERE authorization_status = 'VALID';
