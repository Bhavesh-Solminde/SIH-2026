-- Add IN_TRANSIT to the lot status check constraint.
-- Represents a lot that has been acknowledged by a recycler and the collector
-- is now travelling to the recycler facility.
ALTER TABLE lot DROP CONSTRAINT IF EXISTS lot_status_check;
ALTER TABLE lot ADD CONSTRAINT lot_status_check
  CHECK (status IN ('DRAFT','ACCEPTED','IN_TRANSIT','HANDED_OVER','CANCELLED'));
