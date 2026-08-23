-- Enough of the real schema to run enforce_order_integrity() and check what it does to money.
--
-- The trigger is the only place a discount becomes a number a customer pays, and it is written in
-- plpgsql inside a migration — which means without this it is only ever tested in production. What
-- follows is the smallest schema the trigger touches, plus stand-ins for the Supabase auth helpers,
-- so the arithmetic can be run and asserted on an ordinary Postgres.

-- Supabase's roles, so the migration's grants apply verbatim rather than being edited out.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;

-- Who the caller is, and what they may do. Tests set these to move between roles.
create table if not exists auth._current (uid uuid, role text);
insert into auth._current values (null, null);

create or replace function auth.uid() returns uuid language sql stable as $$
  select uid from auth._current limit 1 $$;

create or replace function public.current_staff_role(target_store_id text) returns text language sql stable as $$
  select role from auth._current limit 1 $$;

create or replace function public.has_staff_role(target_store_id text, allowed_roles text[]) returns boolean language sql stable as $$
  select coalesce(public.current_staff_role(target_store_id) = any(allowed_roles), false) $$;

-- The coalesce above is not decoration. `null = any(array[...])` is NULL, not false, and a NULL
-- flowing into `if not <permission> then raise` means the guard silently does not fire — which for
-- a discount check reads as "give the food away". The real functions coalesce for this reason and
-- the stubs have to as well, or the tests prove a safety that production does not have.

-- The real one joins staff_memberships to staff and reads allow_express, so it is true only for
-- someone on the roster. Modelling it as "any staff role" keeps that property — the distinction
-- that matters to these tests is staff versus not-staff, and a customer is not staff.
create or replace function public.has_express_access(target_store_id text) returns boolean language sql stable as $$
  select coalesce(public.current_staff_role(target_store_id) = any(array[
    'developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']), false) $$;

create or replace function public.can_settle_payments(target_store_id text) returns boolean language sql stable as $$
  select public.has_staff_role(target_store_id, array['developer','owner','manager','cashier','waiter','delivery'])
      or public.has_express_access(target_store_id) $$;

create table if not exists public.menu_items (
  id bigint primary key,
  store_id text not null default 'the-taste',
  name varchar(100) not null,
  price numeric(10,2) not null,
  is_veg boolean not null default true,
  is_available boolean not null default true
);

create table if not exists public.store_security_settings (
  store_id text primary key,
  gst_percent numeric(5,2) not null default 5.00,
  delivery_fee numeric(10,2) not null default 0.00,
  max_discount_percent numeric(5,2) not null default 100.00,
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id bigserial primary key,
  store_id text not null default 'the-taste',
  client_order_id uuid not null default gen_random_uuid(),
  idempotency_key text not null default gen_random_uuid()::text,
  order_number text not null,
  type text not null default 'takeaway',
  status text not null default 'pending',
  channel text not null default 'pos',
  source text not null default 'pos',
  auth_user_id uuid,
  items jsonb not null,
  subtotal numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0,
  tax_percent numeric(5,2) not null default 0,
  delivery_fee numeric(10,2) not null default 0,
  total numeric(12,2) not null default 0,
  payment_method text,
  payment_status text not null default 'unpaid',
  payment_reference text,
  payment_verified_at timestamptz,
  payment_verified_by text,
  payment_collected_at timestamptz,
  delivery_status text not null default 'none',
  requires_server_validation boolean not null default false,
  validation_status text not null default 'accepted',
  updated_at timestamptz not null default now()
);

insert into public.store_security_settings (store_id, gst_percent, delivery_fee)
values ('the-taste', 5.00, 0.00) on conflict (store_id) do nothing;

insert into public.menu_items (id, store_id, name, price) values
  (1, 'the-taste', 'French Fries', 80.00),
  (2, 'the-taste', 'Masala Fries', 90.00),
  (3, 'the-taste', 'Chicken Crispy', 120.00)
on conflict (id) do nothing;
