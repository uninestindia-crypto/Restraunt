-- Production launch hardening.
-- The browser is untrusted: authorization, prices, payment state, loyalty,
-- inventory effects, and privileged staff data are enforced in Postgres.

create table if not exists public.store_security_settings (
  store_id text primary key,
  gst_percent numeric(5, 2) not null default 5.00 check (gst_percent between 0 and 30),
  delivery_fee numeric(10, 2) not null default 0.00 check (delivery_fee >= 0),
  updated_at timestamptz not null default now()
);
alter table public.store_security_settings enable row level security;
revoke all on table public.store_security_settings from anon, authenticated;
insert into public.store_security_settings (store_id, gst_percent, delivery_fee)
values ('the-taste', 5.00, 0.00)
on conflict (store_id) do nothing;

-- PIN-only authentication is retired. Keep the legacy column nullable for a
-- rollback window, but never expose it through grants or application queries.
alter table public.staff alter column pin_hash drop not null;
alter table public.staff alter column pin_hash drop default;

create or replace function public.current_staff_role(target_store_id text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select sm.role
  from public.staff_memberships sm
  where sm.store_id = target_store_id
    and sm.auth_user_id = (select auth.uid())
    and sm.is_active = true
  limit 1
$$;
revoke all on function public.current_staff_role(text) from public, anon;
grant execute on function public.current_staff_role(text) to authenticated, service_role;

create or replace function public.has_staff_role(target_store_id text, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_staff_role(target_store_id) = any(allowed_roles), false)
$$;
revoke all on function public.has_staff_role(text, text[]) from public, anon;
grant execute on function public.has_staff_role(text, text[]) to authenticated, service_role;

-- Explicit grants are the first authorization layer; RLS below is the second.
revoke all on table
  public.menu_categories, public.menu_items, public.orders, public.tables,
  public.inventory, public.suppliers, public.staff, public.staff_memberships,
  public.shifts, public.activity_log, public.audit_events, public.customers,
  public.recipes, public.reservations, public.document_embeddings
from anon, authenticated;

grant select on table public.menu_categories, public.menu_items, public.tables to anon, authenticated;
grant insert, update, delete on table public.menu_categories, public.menu_items, public.tables to authenticated;
grant select, insert, update on table public.orders, public.inventory, public.customers to authenticated;
grant select, insert, update, delete on table public.suppliers, public.shifts, public.recipes, public.reservations to authenticated;
grant select, insert on table public.activity_log, public.audit_events to authenticated;
grant select on table public.staff_memberships to authenticated;
grant select (id, store_id, auth_user_id, name, role, allow_express, is_active, created_at, updated_at)
  on table public.staff to authenticated;

-- Replace broad policies with role- and ownership-aware policies.
drop policy if exists "staff access menu_categories" on public.menu_categories;
drop policy if exists "staff read menu_categories" on public.menu_categories;
drop policy if exists "managers write menu_categories" on public.menu_categories;
create policy "staff read menu_categories" on public.menu_categories
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']));
create policy "managers write menu_categories" on public.menu_categories
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff access menu_items" on public.menu_items;
drop policy if exists "staff read menu_items" on public.menu_items;
drop policy if exists "managers write menu_items" on public.menu_items;
create policy "staff read menu_items" on public.menu_items
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']));
create policy "managers write menu_items" on public.menu_items
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff access orders" on public.orders;
drop policy if exists "customer insert own orders" on public.orders;
drop policy if exists "staff read orders" on public.orders;
drop policy if exists "staff insert orders" on public.orders;
drop policy if exists "staff update orders" on public.orders;
create policy "staff read orders" on public.orders
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']));
create policy "staff insert orders" on public.orders
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']));
create policy "staff update orders" on public.orders
  for update to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']));

drop policy if exists "staff access tables" on public.tables;
drop policy if exists "public read tables" on public.tables;
drop policy if exists "staff write tables" on public.tables;
create policy "public read tables" on public.tables
  for select to anon, authenticated using (true);
create policy "staff write tables" on public.tables
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']));

drop policy if exists "staff access inventory" on public.inventory;
drop policy if exists "staff read inventory" on public.inventory;
drop policy if exists "managers write inventory" on public.inventory;
create policy "staff read inventory" on public.inventory
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen']));
create policy "managers write inventory" on public.inventory
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff access suppliers" on public.suppliers;
drop policy if exists "managers access suppliers" on public.suppliers;
create policy "managers access suppliers" on public.suppliers
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff access staff" on public.staff;
drop policy if exists "staff read own profile" on public.staff;
drop policy if exists "managers read staff roster" on public.staff;
create policy "staff read own profile" on public.staff
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and is_active = true);
create policy "managers read staff roster" on public.staff
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff memberships self read" on public.staff_memberships;
create policy "staff memberships self read" on public.staff_memberships
  for select to authenticated
  using (auth_user_id = (select auth.uid()) and is_active = true);

drop policy if exists "staff access shifts" on public.shifts;
drop policy if exists "staff read shifts" on public.shifts;
drop policy if exists "staff write own shifts" on public.shifts;
create policy "staff read shifts" on public.shifts
  for select to authenticated
  using (
    public.has_staff_role(store_id, array['developer','owner','manager'])
    or exists (
      select 1 from public.staff s
      where s.id = shifts.staff_id and s.auth_user_id = (select auth.uid()) and s.is_active = true
    )
  );
create policy "staff write own shifts" on public.shifts
  for all to authenticated
  using (
    public.has_staff_role(store_id, array['developer','owner','manager'])
    or exists (
      select 1 from public.staff s
      where s.id = shifts.staff_id and s.auth_user_id = (select auth.uid()) and s.is_active = true
    )
  )
  with check (
    public.has_staff_role(store_id, array['developer','owner','manager'])
    or exists (
      select 1 from public.staff s
      where s.id = shifts.staff_id and s.auth_user_id = (select auth.uid()) and s.is_active = true
    )
  );

drop policy if exists "staff access activity_log" on public.activity_log;
drop policy if exists "staff insert activity_log" on public.activity_log;
drop policy if exists "managers read activity_log" on public.activity_log;
create policy "staff insert activity_log" on public.activity_log
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']));
create policy "managers read activity_log" on public.activity_log
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff access audit_events" on public.audit_events;
drop policy if exists "staff insert audit_events" on public.audit_events;
drop policy if exists "owners read audit_events" on public.audit_events;
create policy "staff insert audit_events" on public.audit_events
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery']));
create policy "owners read audit_events" on public.audit_events
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner']));

drop policy if exists "staff access customers" on public.customers;
drop policy if exists "customer self read write" on public.customers;
drop policy if exists "customer read own profile" on public.customers;
drop policy if exists "customer create own profile" on public.customers;
drop policy if exists "customer update own profile" on public.customers;
drop policy if exists "staff read customers" on public.customers;
drop policy if exists "staff write customers" on public.customers;
create policy "customer read own profile" on public.customers
  for select to authenticated using (auth_user_id = (select auth.uid()));
create policy "customer create own profile" on public.customers
  for insert to authenticated with check (auth_user_id = (select auth.uid()));
create policy "customer update own profile" on public.customers
  for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));
create policy "staff read customers" on public.customers
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','delivery']));
create policy "staff write customers" on public.customers
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']));
drop policy if exists "staff update customers" on public.customers;
create policy "staff update customers" on public.customers
  for update to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']));

drop policy if exists "staff access recipes" on public.recipes;
drop policy if exists "staff read recipes" on public.recipes;
drop policy if exists "managers write recipes" on public.recipes;
create policy "staff read recipes" on public.recipes
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','kitchen']));
create policy "managers write recipes" on public.recipes
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager']));

drop policy if exists "staff access reservations" on public.reservations;
drop policy if exists "staff manage reservations" on public.reservations;
create policy "staff manage reservations" on public.reservations
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter']));

drop policy if exists "staff access document_embeddings" on public.document_embeddings;
revoke all on table public.document_embeddings from anon, authenticated;

-- Customers may only review orders that belong to their authenticated account.
drop policy if exists "Customers insert own reviews" on public.customer_reviews;
drop policy if exists "Customers update own reviews" on public.customer_reviews;
create policy "Customers insert own reviews" on public.customer_reviews
  for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders o
      where o.store_id = customer_reviews.store_id
        and o.client_order_id::text = customer_reviews.order_client_id
        and o.auth_user_id = (select auth.uid())
        and o.status in ('completed','served')
    )
  );
create policy "Customers update own reviews" on public.customer_reviews
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1 from public.orders o
      where o.store_id = customer_reviews.store_id
        and o.client_order_id::text = customer_reviews.order_client_id
        and o.auth_user_id = (select auth.uid())
        and o.status in ('completed','served')
    )
  );

-- Prevent clients from setting loyalty balances or moving a profile between identities/stores.
create or replace function public.protect_customer_financial_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if pg_trigger_depth() > 1 or (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.total_spent := 0;
    new.visit_count := 0;
    new.loyalty_points := 0;
    new.tier := 'bronze';
    new.last_visit := null;
  else
    if new.store_id is distinct from old.store_id
      or new.auth_user_id is distinct from old.auth_user_id then
      raise exception 'Customer identity and store are immutable';
    end if;
    if new.total_spent is distinct from old.total_spent
      or new.visit_count is distinct from old.visit_count
      or new.loyalty_points is distinct from old.loyalty_points
      or new.tier is distinct from old.tier
      or new.last_visit is distinct from old.last_visit then
      raise exception 'Customer financial and loyalty fields are server managed';
    end if;
  end if;
  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.protect_customer_financial_fields() from public, anon, authenticated;
drop trigger if exists trg_protect_customer_financial_fields on public.customers;
create trigger trg_protect_customer_financial_fields
before insert or update on public.customers
for each row execute function public.protect_customer_financial_fields();

-- Rebuild every order line from the authoritative menu and enforce role-specific updates.
create or replace function public.enforce_order_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  raw_item jsonb;
  menu_row record;
  item_id bigint;
  item_quantity integer;
  validated_items jsonb := '[]'::jsonb;
  computed_subtotal numeric(12, 2) := 0;
  configured_tax numeric(5, 2) := 5.00;
  configured_delivery_fee numeric(10, 2) := 0.00;
begin
  caller_role := public.current_staff_role(new.store_id);

  if new.status not in ('pending','confirmed','preparing','ready','completed','cancelled') then
    raise exception 'Invalid order status';
  end if;
  if new.delivery_status not in ('none','pending','assigned','out_for_delivery','delivered','failed') then
    raise exception 'Invalid delivery status';
  end if;

  if tg_op = 'INSERT' or new.items is distinct from old.items then
    if jsonb_typeof(new.items) <> 'array'
      or jsonb_array_length(new.items) = 0
      or jsonb_array_length(new.items) > 40 then
      raise exception 'Order must contain between 1 and 40 line items';
    end if;

    for raw_item in select value from jsonb_array_elements(new.items)
    loop
      item_id := nullif(coalesce(raw_item->>'itemId', raw_item->>'id'), '')::bigint;
      item_quantity := nullif(raw_item->>'quantity', '')::integer;
      if item_id is null or item_quantity is null or item_quantity < 1 or item_quantity > 50 then
        raise exception 'Invalid order item or quantity';
      end if;

      select mi.id, mi.name, mi.price, mi.is_veg
      into menu_row
      from public.menu_items mi
      where mi.id = item_id and mi.store_id = new.store_id and mi.is_available = true;
      if not found then
        raise exception 'Menu item % is unavailable', item_id;
      end if;

      computed_subtotal := computed_subtotal + (menu_row.price * item_quantity);
      validated_items := validated_items || jsonb_build_array(jsonb_build_object(
        'itemId', menu_row.id,
        'itemName', menu_row.name,
        'price', menu_row.price,
        'quantity', item_quantity,
        'isVeg', menu_row.is_veg,
        'notes', left(coalesce(raw_item->>'notes', ''), 240)
      ));
    end loop;

    select s.gst_percent, s.delivery_fee
    into configured_tax, configured_delivery_fee
    from public.store_security_settings s
    where s.store_id = new.store_id;
    configured_tax := coalesce(configured_tax, 5.00);
    configured_delivery_fee := coalesce(configured_delivery_fee, 0.00);

    new.items := validated_items;
    new.subtotal := round(computed_subtotal, 2);
    new.tax_percent := configured_tax;
    new.tax := round(computed_subtotal * configured_tax / 100, 2);
    new.delivery_fee := case when new.type = 'delivery' then configured_delivery_fee else 0 end;
    new.total := new.subtotal + new.tax + new.delivery_fee;
    new.requires_server_validation := false;
    new.validation_status := 'accepted';
  end if;

  if tg_op = 'INSERT' then
    if new.type not in ('delivery','takeaway','dinein') then
      raise exception 'Invalid order type';
    end if;
    if new.channel not in ('pos','online','qr','express')
      or new.source not in ('pos','online','qr','express') then
      raise exception 'Invalid order channel';
    end if;
    if new.payment_method is not null and new.payment_method not in ('cash','upi') then
      raise exception 'Unsupported payment method';
    end if;
    if new.payment_status not in ('unpaid','pending','paid','partial','refunded','failed') then
      raise exception 'Invalid payment status';
    end if;
    if (select auth.uid()) is not null
      and new.payment_status in ('paid','partial')
      and caller_role not in ('developer','owner','manager','cashier') then
      raise exception 'Role % cannot confirm payment', coalesce(caller_role, 'customer');
    end if;
  else
    if new.store_id is distinct from old.store_id
      or new.client_order_id is distinct from old.client_order_id
      or new.idempotency_key is distinct from old.idempotency_key
      or new.order_number is distinct from old.order_number
      or new.type is distinct from old.type
      or new.channel is distinct from old.channel
      or new.source is distinct from old.source
      or new.auth_user_id is distinct from old.auth_user_id
      or new.items is distinct from old.items
      or new.subtotal is distinct from old.subtotal
      or new.tax is distinct from old.tax
      or new.tax_percent is distinct from old.tax_percent
      or new.delivery_fee is distinct from old.delivery_fee
      or new.total is distinct from old.total then
      raise exception 'Order identity, items, and totals are immutable';
    end if;

    if new.payment_method is not null and new.payment_method not in ('cash','upi') then
      raise exception 'Unsupported payment method';
    end if;
    if new.payment_status not in ('unpaid','pending','paid','partial','refunded','failed') then
      raise exception 'Invalid payment status';
    end if;

    if (new.payment_method is distinct from old.payment_method
      or new.payment_status is distinct from old.payment_status
      or new.payment_reference is distinct from old.payment_reference
      or new.payment_verified_at is distinct from old.payment_verified_at
      or new.payment_verified_by is distinct from old.payment_verified_by
      or new.payment_collected_at is distinct from old.payment_collected_at)
      and (select auth.uid()) is not null
      and caller_role not in ('developer','owner','manager','cashier') then
      raise exception 'Role % cannot modify payment state', coalesce(caller_role, 'customer');
    end if;

    if old.payment_status is distinct from new.payment_status then
      if old.payment_status = 'paid' and new.payment_status = 'refunded'
        and caller_role not in ('developer','owner','manager') then
        raise exception 'Role % cannot refund payments', coalesce(caller_role, 'customer');
      elsif old.payment_status in ('refunded','failed') then
        raise exception 'Terminal payment states cannot be changed';
      elsif old.payment_status = 'paid' and new.payment_status <> 'refunded' then
        raise exception 'Paid orders can only transition to refunded';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end
$$;
revoke all on function public.enforce_order_integrity() from public, anon, authenticated;
drop trigger if exists trg_enforce_order_integrity on public.orders;
create trigger trg_enforce_order_integrity
before insert or update on public.orders
for each row execute function public.enforce_order_integrity();

-- Loyalty changes follow confirmed payment transitions, never profile input.
create or replace function public.apply_order_loyalty()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  points_delta integer := 0;
  spend_delta numeric(10, 2) := 0;
  visit_delta integer := 0;
begin
  if tg_op = 'INSERT' and new.payment_status = 'paid' then
    spend_delta := new.total;
    points_delta := floor(new.total)::integer;
    visit_delta := 1;
  elsif tg_op = 'UPDATE' and old.payment_status is distinct from 'paid' and new.payment_status = 'paid' then
    spend_delta := new.total;
    points_delta := floor(new.total)::integer;
    visit_delta := 1;
  elsif tg_op = 'UPDATE' and old.payment_status = 'paid' and new.payment_status in ('refunded','failed') then
    spend_delta := -old.total;
    points_delta := -floor(old.total)::integer;
    visit_delta := -1;
  else
    return new;
  end if;

  update public.customers c
  set total_spent = greatest(0, c.total_spent + spend_delta),
      visit_count = greatest(0, c.visit_count + visit_delta),
      loyalty_points = greatest(0, c.loyalty_points + points_delta),
      tier = case
        when greatest(0, c.loyalty_points + points_delta) >= 1000 then 'gold'
        when greatest(0, c.loyalty_points + points_delta) >= 500 then 'silver'
        else 'bronze'
      end,
      last_visit = case when spend_delta > 0 then now() else c.last_visit end,
      updated_at = now()
  where c.store_id = new.store_id
    and (
      (new.auth_user_id is not null and c.auth_user_id = new.auth_user_id)
      or (new.auth_user_id is null and new.customer_phone <> '' and c.phone = new.customer_phone)
    );
  return new;
end
$$;
revoke all on function public.apply_order_loyalty() from public, anon, authenticated;
drop trigger if exists trg_apply_order_loyalty on public.orders;
create trigger trg_apply_order_loyalty
after insert or update of payment_status on public.orders
for each row execute function public.apply_order_loyalty();

-- Inventory consumes only item IDs rebuilt by enforce_order_integrity.
create or replace function public.deduct_inventory_on_order()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_item record;
  recipe_ingredient record;
begin
  for order_item in
    select * from jsonb_to_recordset(new.items)
      as x("itemId" bigint, quantity integer)
  loop
    for recipe_ingredient in
      select ingredient."inventoryId", ingredient.quantity
      from public.recipes r
      cross join lateral jsonb_to_recordset(r.ingredients)
        as ingredient("inventoryId" bigint, quantity numeric)
      where r.store_id = new.store_id and r.menu_item_id = order_item."itemId"
    loop
      update public.inventory
      set quantity = greatest(0, quantity - (recipe_ingredient.quantity * order_item.quantity)),
          updated_at = now()
      where id = recipe_ingredient."inventoryId" and store_id = new.store_id;
    end loop;
  end loop;
  return new;
end
$$;
revoke all on function public.deduct_inventory_on_order() from public, anon, authenticated;
drop trigger if exists trg_deduct_inventory_on_order on public.orders;
create trigger trg_deduct_inventory_on_order
after insert on public.orders
for each row execute function public.deduct_inventory_on_order();

-- Remove the mock payment and obsolete PIN APIs entirely.
drop function if exists public.emulate_stripe_webhook(uuid, text, text);
drop function if exists public.consume_staff_pin_attempt(text, text, integer, integer);
drop table if exists public.staff_pin_rate_limits;

-- Replace the historical sequence trigger with a fixed-search-path version.
create or replace function public.sync_orders_id_sequence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  seq_name text;
  curr_val bigint;
begin
  if new.id is not null then
    seq_name := pg_get_serial_sequence('public.orders', 'id');
    if seq_name is not null then
      execute format('select last_value from %s', seq_name) into curr_val;
      if new.id > curr_val then
        perform pg_catalog.setval(seq_name::regclass, new.id);
      end if;
    end if;
  end if;
  return new;
end
$$;
revoke all on function public.sync_orders_id_sequence() from public, anon, authenticated;

-- Storage writes are limited to menu managers and the known item path.
drop policy if exists "Allow staff to manage menu images" on storage.objects;
drop policy if exists "Managers manage menu images" on storage.objects;
create policy "Managers manage menu images" on storage.objects
  for all to authenticated
  using (
    bucket_id = 'menu-images'
    and name like 'items/%'
    and public.has_staff_role('the-taste', array['developer','owner','manager'])
  )
  with check (
    bucket_id = 'menu-images'
    and name like 'items/%'
    and public.has_staff_role('the-taste', array['developer','owner','manager'])
  );

-- Paid AI calls use an atomic, durable rate limit shared across Edge workers.
create index if not exists idx_audit_events_ai_rate_limit
  on public.audit_events(actor_auth_user_id, action, created_at desc);

create or replace function public.consume_staff_ai_attempt(
  target_auth_user_id uuid,
  target_store_id text,
  target_staff_id bigint,
  target_tier text,
  max_attempts integer,
  window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt_count integer;
begin
  if target_auth_user_id is null or max_attempts < 1 or window_seconds < 1 then
    return false;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('staff-ai:' || target_auth_user_id::text, 0)
  );

  select count(*) into attempt_count
  from public.audit_events
  where actor_auth_user_id = target_auth_user_id
    and action = 'ai_chat_request'
    and created_at >= now() - pg_catalog.make_interval(secs => window_seconds);

  if attempt_count >= max_attempts then
    return false;
  end if;

  insert into public.audit_events(
    store_id, actor_staff_id, actor_auth_user_id, action, target_table, details
  ) values (
    target_store_id, target_staff_id, target_auth_user_id,
    'ai_chat_request', 'ai', pg_catalog.jsonb_build_object('tier', target_tier)
  );
  return true;
end
$$;
revoke all on function public.consume_staff_ai_attempt(uuid, text, bigint, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_staff_ai_attempt(uuid, text, bigint, text, integer, integer)
  to service_role;
