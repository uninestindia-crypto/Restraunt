-- Sync gap remediation: reservations table + realtime publication for missing tables.
-- Safe to run on an existing project. Idempotent (IF NOT EXISTS / ON CONFLICT).

-- ── 1. Reservations Table ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT PRIMARY KEY,
  store_id TEXT NOT NULL DEFAULT 'the-taste',
  table_id BIGINT REFERENCES tables(id) ON DELETE SET NULL,
  customer_id BIGINT REFERENCES customers(id) ON DELETE SET NULL,
  date VARCHAR(30) NOT NULL,
  time VARCHAR(30) NOT NULL,
  party_size INT DEFAULT 2,
  status VARCHAR(20) DEFAULT 'pending',
  notes TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON reservations TO authenticated;

DROP POLICY IF EXISTS "staff access reservations" ON reservations;
CREATE POLICY "staff access reservations" ON reservations
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM staff_memberships sm WHERE sm.store_id = reservations.store_id AND sm.auth_user_id = (SELECT auth.uid()) AND sm.is_active = TRUE))
  WITH CHECK (EXISTS (SELECT 1 FROM staff_memberships sm WHERE sm.store_id = reservations.store_id AND sm.auth_user_id = (SELECT auth.uid()) AND sm.is_active = TRUE));

-- ── 2. Add Missing Tables to Realtime Publication ──────────────────
-- Only adds tables that actually exist in the database (safe if customer
-- platform migration has not been applied yet).
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['recipes','reservations','customer_offers','customer_favorites','customer_reviews']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = tbl AND n.nspname = 'public') THEN
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', tbl);
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN undefined_object THEN NULL;
      END;
    END IF;
  END LOOP;
END $$;
