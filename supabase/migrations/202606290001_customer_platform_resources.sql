-- Customer platform resources: public offers plus authenticated customer-owned data.
-- Created manually because Supabase CLI is not installed in this workspace.

create table if not exists public.customer_offers (
  id uuid primary key default gen_random_uuid(),
  store_id text not null default 'the-taste',
  code text not null,
  title text not null,
  label text,
  description text,
  display_value text,
  icon text default 'local_offer',
  customer_segment text default 'all',
  requires_auth boolean not null default false,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, code)
);

create table if not exists public.customer_favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id text not null default 'the-taste',
  menu_item_id bigint not null,
  item_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id, menu_item_id)
);

create table if not exists public.customer_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id text not null default 'the-taste',
  order_id uuid,
  order_client_id text not null,
  rating integer not null check (rating between 1 and 5),
  comment text default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, order_client_id)
);

create table if not exists public.customer_saved_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id text not null default 'the-taste',
  label text not null default 'Home',
  address text not null,
  landmark text default '',
  latitude numeric,
  longitude numeric,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customer_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  store_id text not null default 'the-taste',
  preference_key text not null,
  enabled boolean not null default false,
  channel text not null default 'retention',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, store_id, preference_key)
);

alter table public.customer_offers enable row level security;
alter table public.customer_favorites enable row level security;
alter table public.customer_reviews enable row level security;
alter table public.customer_saved_addresses enable row level security;
alter table public.customer_notification_preferences enable row level security;

drop policy if exists "Anyone can read active customer offers" on public.customer_offers;
create policy "Anyone can read active customer offers"
on public.customer_offers
for select
to anon, authenticated
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at >= now())
);

drop policy if exists "Customers read own favourites" on public.customer_favorites;
create policy "Customers read own favourites"
on public.customer_favorites
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers insert own favourites" on public.customer_favorites;
create policy "Customers insert own favourites"
on public.customer_favorites
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update own favourites" on public.customer_favorites;
create policy "Customers update own favourites"
on public.customer_favorites
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers delete own favourites" on public.customer_favorites;
create policy "Customers delete own favourites"
on public.customer_favorites
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers read own reviews" on public.customer_reviews;
create policy "Customers read own reviews"
on public.customer_reviews
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers insert own reviews" on public.customer_reviews;
create policy "Customers insert own reviews"
on public.customer_reviews
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update own reviews" on public.customer_reviews;
create policy "Customers update own reviews"
on public.customer_reviews
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers read own saved addresses" on public.customer_saved_addresses;
create policy "Customers read own saved addresses"
on public.customer_saved_addresses
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers insert own saved addresses" on public.customer_saved_addresses;
create policy "Customers insert own saved addresses"
on public.customer_saved_addresses
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update own saved addresses" on public.customer_saved_addresses;
create policy "Customers update own saved addresses"
on public.customer_saved_addresses
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers delete own saved addresses" on public.customer_saved_addresses;
create policy "Customers delete own saved addresses"
on public.customer_saved_addresses
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers read own notification preferences" on public.customer_notification_preferences;
create policy "Customers read own notification preferences"
on public.customer_notification_preferences
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Customers insert own notification preferences" on public.customer_notification_preferences;
create policy "Customers insert own notification preferences"
on public.customer_notification_preferences
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Customers update own notification preferences" on public.customer_notification_preferences;
create policy "Customers update own notification preferences"
on public.customer_notification_preferences
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

grant select on public.customer_offers to anon, authenticated;
grant select, insert, update, delete on public.customer_favorites to authenticated;
grant select, insert, update on public.customer_reviews to authenticated;
grant select, insert, update, delete on public.customer_saved_addresses to authenticated;
grant select, insert, update on public.customer_notification_preferences to authenticated;

insert into public.customer_offers (store_id, code, title, label, description, display_value, icon, sort_order)
values
  ('the-taste', 'WOKSIP', 'Wok & sip', 'Combo favourite', 'Pair selected noodles with a chilled drink for a better-value meal.', 'Server validates at checkout', 'lunch_dining', 10),
  ('the-taste', 'TABLEFEAST', 'Table feast', 'Made for sharing', 'A generous spread for starters, mains, rice, and beverages.', 'Serves 4', 'groups', 20),
  ('the-taste', 'REWARDS', 'Points on every order', 'Taste Rewards', 'Sign in before checkout and grow your rewards balance with every meal.', 'Members', 'workspace_premium', 30)
on conflict (store_id, code) do update
set title = excluded.title,
    label = excluded.label,
    description = excluded.description,
    display_value = excluded.display_value,
    icon = excluded.icon,
    sort_order = excluded.sort_order,
    updated_at = now();
