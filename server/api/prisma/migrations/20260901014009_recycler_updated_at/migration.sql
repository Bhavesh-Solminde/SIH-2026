-- Add updated_at to recycler so /sync/delta can answer "changed since cursor"
ALTER TABLE recycler ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill historical rows with created_at so they are not all "updated now"
UPDATE recycler SET updated_at = created_at;

-- Keep updated_at current on every UPDATE
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER recycler_touch
  BEFORE UPDATE ON recycler
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
