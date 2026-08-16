-- The tax rate had three homes and no owner.
--
--   1. Per device. The client read `getSetting('gstPercent')` out of IndexedDB. `settings` is not a
--      synced resource and has no table here, so the rate was per browser: two tills could charge
--      differently, and a new device started on the seeded default.
--   2. Per deployment. `public-order` — which prices every customer order and is therefore the only
--      authoritative one — read `Deno.env.get("GST_PERCENT")`.
--   3. Nowhere. `store_security_settings.gst_percent` existed, defaulted to 5.00, and was read by
--      no code at all.
--
-- They agreed only because all three happened to sit at 5%. Changing the rate in the Settings
-- screen moved the number the customer was *shown* and not the number they were *charged*.
--
-- This makes (3) the single source. It is already the right place: one row per store, server-side,
-- constrained. What it lacked was any way for the app to read or write it.

-- ── Read ──────────────────────────────────────────────────────────────────
-- The storefront has to show the rate before a guest has any session, so `anon` reads it. This is
-- the rate printed on every bill — public by nature. The grant is column-scoped so that adding a
-- genuinely sensitive column here later does not silently publish it.
grant select (store_id, gst_percent, delivery_fee, updated_at)
  on table public.store_security_settings to anon, authenticated;

drop policy if exists "anyone may read the store's published rates" on public.store_security_settings;
create policy "anyone may read the store's published rates"
  on public.store_security_settings
  for select to anon, authenticated
  using (true);

-- ── Write ─────────────────────────────────────────────────────────────────
-- Only the roles that may already change money settings. A cashier cannot reprice the store's tax.
grant update (gst_percent, delivery_fee, updated_at)
  on table public.store_security_settings to authenticated;

drop policy if exists "managers may set the store's rates" on public.store_security_settings;
create policy "managers may set the store's rates"
  on public.store_security_settings
  for update to authenticated
  using (public.current_staff_role(store_id) in ('developer', 'owner', 'manager'))
  with check (public.current_staff_role(store_id) in ('developer', 'owner', 'manager'));

-- No insert and no delete: a store's settings row is created with the store and outlives every
-- session. Nothing in the app should be able to remove the row that prices its orders.

-- ── Keep updated_at honest ────────────────────────────────────────────────
create or replace function public.touch_store_security_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_touch_store_security_settings on public.store_security_settings;
create trigger trg_touch_store_security_settings
  before update on public.store_security_settings
  for each row execute function public.touch_store_security_settings();

-- The row must exist for every store, or a read returns nothing and the caller falls back to a
-- default — which is the failure mode this migration exists to remove.
insert into public.store_security_settings (store_id, gst_percent, delivery_fee)
values ('the-taste', 5.00, 0.00)
on conflict (store_id) do nothing;
