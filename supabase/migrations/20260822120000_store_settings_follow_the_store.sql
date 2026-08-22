-- Put the store's own settings in the store, not in one browser.
--
-- Everything on the Settings screen except the tax rate and the delivery fee lived only in that
-- device's IndexedDB. Set the UPI ID on the laptop and the phone still had none; set the receipt
-- footer on till 1 and till 2 printed without it; replace a device and the configuration is gone
-- with it. For a restaurant with more than one screen — which is the whole premise of this product
-- — that is not a preference, it is a defect.
--
-- One row per store per key, so a setting added later needs no migration.
create table if not exists public.store_settings (
  store_id text not null default 'the-taste',
  key text not null,
  value text not null default '',
  updated_at timestamptz not null default now(),
  primary key (store_id, key)
);

alter table public.store_settings enable row level security;

-- ── Read ──────────────────────────────────────────────────────────────────
-- Staff only, and deliberately not `anon`. Some of what lands here is fine in public — the
-- restaurant's name, its address — and some is not, and the table cannot tell them apart. The
-- storefront already gets everything it needs from the static export and the published rates, so
-- there is no reason to open this to the world and every reason not to.
revoke all on table public.store_settings from anon, authenticated;
grant select on table public.store_settings to authenticated;

drop policy if exists "staff read store settings" on public.store_settings;
create policy "staff read store settings" on public.store_settings
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

-- ── Write ─────────────────────────────────────────────────────────────────
-- The same three roles that may already change what a customer is charged. A cashier cannot
-- rename the restaurant or repoint its UPI ID, which is the one key here worth real money.
grant insert, update on table public.store_settings to authenticated;

drop policy if exists "managers write store settings" on public.store_settings;
create policy "managers write store settings" on public.store_settings
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "managers update store settings" on public.store_settings;
create policy "managers update store settings" on public.store_settings
  for update to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

-- No delete. A key that stops being used stops being read; removing rows only creates a way for
-- one device to blank another device's configuration.

-- ── Keep updated_at honest ────────────────────────────────────────────────
-- Last write wins, and the client compares timestamps to decide whether the cloud copy is newer
-- than its own. A client-supplied updated_at would let a device with a wrong clock pin a stale
-- value in place forever.
create or replace function public.touch_store_settings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.touch_store_settings() from public, anon, authenticated;

drop trigger if exists trg_touch_store_settings on public.store_settings;
create trigger trg_touch_store_settings
before insert or update on public.store_settings
for each row execute function public.touch_store_settings();

create index if not exists idx_store_settings_store on public.store_settings(store_id);

-- ── What actually landed ──────────────────────────────────────────────────
select tablename, policyname, cmd from pg_policies
where schemaname = 'public' and tablename = 'store_settings'
order by policyname;
