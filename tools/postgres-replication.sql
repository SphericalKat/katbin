CREATE TABLE IF NOT EXISTS katbin_replication_events (
  id BIGSERIAL PRIMARY KEY,
  table_name TEXT NOT NULL CHECK (table_name IN ('users', 'pastes')),
  row_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('INSERT', 'UPDATE', 'DELETE')),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE OR REPLACE FUNCTION katbin_capture_replication_event()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed_row_id TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    changed_row_id := OLD.id::text;
  ELSE
    changed_row_id := NEW.id::text;
  END IF;

  INSERT INTO katbin_replication_events (table_name, row_id, operation)
  VALUES (TG_TABLE_NAME, changed_row_id, TG_OP);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS katbin_capture_replication_events ON users;
CREATE TRIGGER katbin_capture_replication_events
AFTER INSERT OR UPDATE OR DELETE ON users
FOR EACH ROW EXECUTE FUNCTION katbin_capture_replication_event();

DROP TRIGGER IF EXISTS katbin_capture_replication_events ON pastes;
CREATE TRIGGER katbin_capture_replication_events
AFTER INSERT OR UPDATE OR DELETE ON pastes
FOR EACH ROW EXECUTE FUNCTION katbin_capture_replication_event();
