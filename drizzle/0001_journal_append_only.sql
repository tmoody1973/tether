CREATE FUNCTION journal_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'journal is append-only';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER journal_no_update_delete
BEFORE UPDATE OR DELETE ON journal
FOR EACH ROW EXECUTE FUNCTION journal_append_only();
