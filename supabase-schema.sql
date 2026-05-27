-- The Taste Restaurant OS - Supabase launch schema
-- Single-restaurant default store_id: the-taste

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Drop existing legacy tables to prevent "column store_id does not exist" on partial schema upgrades
DROP TABLE IF EXISTS activity_log CASCADE;
DROP TABLE IF EXISTS shifts CASCADE;
DROP TABLE IF EXISTS staff CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS inventory CASCADE;
DROP TABLE IF EXISTS tables CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS menu_items CASCADE;
DROP TABLE IF EXISTS menu_categories CASCADE;
DROP TABLE IF EXISTS customers CASCADE;

CREATE TABLE IF NOT EXISTS menu_categories (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT '',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS menu_items (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    category_id INT REFERENCES menu_categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_available BOOLEAN DEFAULT TRUE,
    is_veg BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    order_number VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(20) DEFAULT 'takeaway',
    status VARCHAR(20) DEFAULT 'pending',
    channel VARCHAR(20) DEFAULT 'pos',
    source VARCHAR(20) DEFAULT 'pos',
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax_percent NUMERIC(5, 2) DEFAULT 0.00,
    delivery_fee NUMERIC(10, 2) DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(20),
    payment_status VARCHAR(20) DEFAULT 'unpaid',
    payment_reference TEXT DEFAULT '',
    payment_verified_at TIMESTAMPTZ,
    payment_verified_by TEXT DEFAULT '',
    payment_collected_at TIMESTAMPTZ,
    customer_name VARCHAR(100) DEFAULT '',
    customer_phone VARCHAR(20) DEFAULT '',
    delivery_address TEXT DEFAULT '',
    delivery_landmark TEXT DEFAULT '',
    delivery_notes TEXT DEFAULT '',
    delivery_status VARCHAR(30) DEFAULT 'none',
    delivery_staff_id INT,
    delivery_staff_name VARCHAR(100) DEFAULT '',
    delivery_assigned_at TIMESTAMPTZ,
    delivery_out_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    staff_id INT,
    staff_name VARCHAR(100) DEFAULT '',
    table_id INT,
    notes TEXT DEFAULT '',
    sync_attempts INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS tables (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    number INT NOT NULL,
    capacity INT DEFAULT 2,
    floor_section VARCHAR(50) DEFAULT 'Main',
    status VARCHAR(20) DEFAULT 'available',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    name VARCHAR(100) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    min_threshold NUMERIC(10, 2) DEFAULT 0.00,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(150) DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS staff (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL CHECK (role IN ('owner', 'manager', 'cashier', 'kitchen', 'waiter', 'delivery')),
    pin_hash VARCHAR(64) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS shifts (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    staff_id INT REFERENCES staff(id) ON DELETE CASCADE,
    clock_in VARCHAR(50),
    clock_out VARCHAR(50),
    date VARCHAR(30),
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS activity_log (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    action VARCHAR(150) NOT NULL,
    staff_name VARCHAR(100) DEFAULT 'System',
    details TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS customers (
    id INT PRIMARY KEY,
    store_id TEXT NOT NULL DEFAULT 'the-taste',
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) NOT NULL,
    birthday VARCHAR(30),
    total_spent NUMERIC(10, 2) DEFAULT 0.00,
    visit_count INT DEFAULT 0,
    loyalty_points INT DEFAULT 0,
    tier VARCHAR(20) DEFAULT 'bronze',
    last_visit TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (store_id, phone)
);

CREATE INDEX IF NOT EXISTS idx_menu_items_category_available ON menu_items(store_id, category_id, is_available);
CREATE INDEX IF NOT EXISTS idx_orders_store_created ON orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(store_id, type, delivery_status);

ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public menu categories read" ON menu_categories;
CREATE POLICY "public menu categories read" ON menu_categories
    FOR SELECT TO anon, authenticated
    USING (store_id = 'the-taste' AND is_active = TRUE);

DROP POLICY IF EXISTS "public menu items read" ON menu_items;
CREATE POLICY "public menu items read" ON menu_items
    FOR SELECT TO anon, authenticated
    USING (store_id = 'the-taste' AND is_available = TRUE);

DROP POLICY IF EXISTS "public order insert only" ON orders;
CREATE POLICY "public order insert only" ON orders
    FOR INSERT TO anon
    WITH CHECK (
        store_id = 'the-taste'
        AND source IN ('online', 'qr')
        AND channel IN ('online', 'qr')
        AND type IN ('delivery', 'takeaway', 'dinein')
        AND payment_status IN ('pending', 'unpaid')
        AND payment_method IN ('upi', 'cash')
    );

DROP POLICY IF EXISTS "authenticated staff full access menu_categories" ON menu_categories;
CREATE POLICY "authenticated staff full access menu_categories" ON menu_categories FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access menu_items" ON menu_items;
CREATE POLICY "authenticated staff full access menu_items" ON menu_items FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access orders" ON orders;
CREATE POLICY "authenticated staff full access orders" ON orders FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access tables" ON tables;
CREATE POLICY "authenticated staff full access tables" ON tables FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access inventory" ON inventory;
CREATE POLICY "authenticated staff full access inventory" ON inventory FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access suppliers" ON suppliers;
CREATE POLICY "authenticated staff full access suppliers" ON suppliers FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access staff" ON staff;
CREATE POLICY "authenticated staff full access staff" ON staff FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access shifts" ON shifts;
CREATE POLICY "authenticated staff full access shifts" ON shifts FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access activity_log" ON activity_log;
CREATE POLICY "authenticated staff full access activity_log" ON activity_log FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');
DROP POLICY IF EXISTS "authenticated staff full access customers" ON customers;
CREATE POLICY "authenticated staff full access customers" ON customers FOR ALL TO authenticated USING (store_id = 'the-taste') WITH CHECK (store_id = 'the-taste');

DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['menu_categories','menu_items','orders','tables','inventory','suppliers','staff','shifts','activity_log','customers']
  LOOP
    BEGIN
      EXECUTE format('ALTER publication supabase_realtime ADD TABLE %I', table_name);
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
    END;
  END LOOP;
END $$;
