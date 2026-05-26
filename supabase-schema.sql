-- ═══════════════════════════════════════════════════
--  NextGenOS Restaurant Operating System
--  Supabase Postgres Database Schema Configuration
--  Version: 2.0.0
-- ═══════════════════════════════════════════════════

-- 1. Enable UUID Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Menu Categories Table
CREATE TABLE IF NOT EXISTS menu_categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    icon VARCHAR(50) DEFAULT '',
    sort_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Menu Items Table
CREATE TABLE IF NOT EXISTS menu_items (
    id SERIAL PRIMARY KEY,
    category_id INT REFERENCES menu_categories(id) ON DELETE SET NULL,
    name VARCHAR(100) NOT NULL,
    price NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    is_available BOOLEAN DEFAULT TRUE,
    is_veg BOOLEAN DEFAULT TRUE,
    sort_order INT DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Orders Table
CREATE TABLE IF NOT EXISTS orders (
    id SERIAL PRIMARY KEY,
    order_number VARCHAR(50) UNIQUE NOT NULL,
    type VARCHAR(20) DEFAULT 'takeaway', -- 'takeaway', 'dine-in', 'delivery'
    status VARCHAR(20) DEFAULT 'pending', -- 'pending', 'preparing', 'ready', 'completed', 'cancelled'
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    tax NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(20), -- 'cash', 'upi', 'card'
    payment_status VARCHAR(20) DEFAULT 'unpaid', -- 'unpaid', 'paid', 'refunded'
    customer_name VARCHAR(100) DEFAULT '',
    customer_phone VARCHAR(20) DEFAULT '',
    notes TEXT DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. Dine-in Tables Table
CREATE TABLE IF NOT EXISTS tables (
    id SERIAL PRIMARY KEY,
    number INT NOT NULL UNIQUE,
    capacity INT DEFAULT 2,
    floor_section VARCHAR(50) DEFAULT 'Main', -- 'Main', 'Window', 'Patio'
    status VARCHAR(20) DEFAULT 'available', -- 'available', 'occupied', 'reserved', 'cleaning'
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 6. Inventory Table
CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    quantity NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    min_threshold NUMERIC(10, 2) DEFAULT 0.00,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 7. Suppliers Table
CREATE TABLE IF NOT EXISTS suppliers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    contact VARCHAR(150) DEFAULT '',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 8. Staff Table
CREATE TABLE IF NOT EXISTS staff (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    role VARCHAR(30) NOT NULL, -- 'owner', 'manager', 'cashier', 'kitchen', 'waiter'
    pin_hash VARCHAR(64) NOT NULL, -- Cryptographically hashed login PIN (SHA-256)
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Note for existing databases:
-- To migrate an existing Supabase 'staff' table, run this SQL in your Supabase SQL Editor:
-- ALTER TABLE staff ADD COLUMN pin_hash VARCHAR(64);
-- UPDATE staff SET pin_hash = encode(digest(pin, 'sha256'), 'hex'); -- If using pgcrypto extension
-- ALTER TABLE staff DROP COLUMN pin;
-- ALTER TABLE staff ALTER COLUMN pin_hash SET NOT NULL;

-- 9. Staff Shifts Table
CREATE TABLE IF NOT EXISTS shifts (
    id SERIAL PRIMARY KEY,
    staff_id INT REFERENCES staff(id) ON DELETE CASCADE,
    clock_in VARCHAR(50),
    clock_out VARCHAR(50),
    date VARCHAR(30),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 10. System Activity Logs Table
CREATE TABLE IF NOT EXISTS activity_log (
    id SERIAL PRIMARY KEY,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    action VARCHAR(150) NOT NULL,
    staff_name VARCHAR(100) DEFAULT 'System',
    details TEXT DEFAULT ''
);

-- 11. Customer Loyalty CRM Table
CREATE TABLE IF NOT EXISTS customers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    phone VARCHAR(20) UNIQUE NOT NULL,
    birthday VARCHAR(30),
    total_spent NUMERIC(10, 2) DEFAULT 0.00,
    visit_count INT DEFAULT 0,
    loyalty_points INT DEFAULT 0,
    tier VARCHAR(20) DEFAULT 'bronze', -- 'bronze', 'silver', 'gold', 'platinum'
    last_visit TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 12. Turn On Real-time Subscriptions for Tables
-- Add tables to the supabase_realtime publication to enable WebSocket replication
ALTER publication supabase_realtime ADD TABLE menu_categories;
ALTER publication supabase_realtime ADD TABLE menu_items;
ALTER publication supabase_realtime ADD TABLE orders;
ALTER publication supabase_realtime ADD TABLE tables;
ALTER publication supabase_realtime ADD TABLE inventory;
ALTER publication supabase_realtime ADD TABLE suppliers;
ALTER publication supabase_realtime ADD TABLE staff;
ALTER publication supabase_realtime ADD TABLE shifts;
ALTER publication supabase_realtime ADD TABLE activity_log;
ALTER publication supabase_realtime ADD TABLE customers;
