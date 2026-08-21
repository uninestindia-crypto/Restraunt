-- Let the staff the owner put on the counter actually bill a customer.
--
-- The complaint was "staff1 cannot take orders". The account signs in, the sidebar offers it the
-- Express Panel, the panel renders a full register — menu, cart, Takeaway/Dine-In/Delivery, Cash
-- and UPI — and pressing Cash fails every time. Three server gates decide whether an express sale
-- is allowed, and a `kitchen` account fails two of them:
--
--   1. `staff insert orders` RLS listed developer, owner, manager, cashier, waiter, temporary_staff.
--   2. `enforce_order_integrity` refuses an INSERT that arrives already settled unless the caller is
--      developer, owner, manager or cashier — "Role kitchen cannot confirm payment". This is the
--      one that actually fires, because it is a BEFORE trigger and runs ahead of the RLS check.
--   3. `staff write tables` excludes kitchen, so an express dine-in cannot seat its table.
--
-- Gate 2 is the wider bug. An express sale is a counter sale: it is settled at the moment it is
-- rung up, so the insert always carries payment_status 'paid'. That means the Express Panel was
-- unusable by *every* role except developer, owner, manager and cashier — including
-- `temporary_staff`, the express-only role whose entire purpose is that one screen. That is the
-- shape of the original report that only the cashier role worked.
--
-- The fix is to make the server honour the grant the owner already gives by hand. "Allow access to
-- Express Panel" is a per-person checkbox in the Staff screen (`staff.allow_express`), it is what
-- the sidebar and the router already gate that screen on, and it is off by default. Until now it
-- decided only what the client drew. Now it decides what Postgres accepts, so the two agree and a
-- screen can no longer offer a capability the database will refuse.
--
-- This is a deliberate privilege grant, and it is the owner's to make: ticking that box for a cook
-- means "this person may work the counter", and a counter worker takes money. Untick it and the
-- account loses the screen and the ability in the same moment.

-- ── The grant, as the server sees it ────────────────────────────
-- A faithful mirror of the client's Express Panel rule: the express-only role, which exists for
-- this screen and is admitted without the flag, or anyone the owner has explicitly ticked.
create or replace function public.has_express_access(target_store_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select sm.role = 'temporary_staff' or coalesce(s.allow_express, false)
    from public.staff_memberships sm
    left join public.staff s
      on s.store_id = sm.store_id and s.id = sm.staff_id and s.is_active = true
    where sm.store_id = target_store_id
      and sm.auth_user_id = (select auth.uid())
      and sm.is_active = true
    limit 1
  ), false)
$$;
revoke all on function public.has_express_access(text) from public, anon;
grant execute on function public.has_express_access(text) to authenticated, service_role;

-- Who may mark money as collected: the till roles, plus whoever the owner put on the counter.
create or replace function public.can_settle_payments(target_store_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_staff_role(target_store_id, array['developer','owner','manager','cashier'])
      or public.has_express_access(target_store_id)
$$;
revoke all on function public.can_settle_payments(text) from public, anon;
grant execute on function public.can_settle_payments(text) to authenticated, service_role;

-- ── Gate 1: taking the order ────────────────────────────────────
drop policy if exists "staff insert orders" on public.orders;
create policy "staff insert orders" on public.orders
  for insert to authenticated
  with check (
    public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff'])
    or public.has_express_access(store_id)
  );

-- ── Gate 3: seating an express dine-in ──────────────────────────
drop policy if exists "staff write tables" on public.tables;
create policy "staff write tables" on public.tables
  for all to authenticated
  using (
    public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff'])
    or public.has_express_access(store_id)
  )
  with check (
    public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff'])
    or public.has_express_access(store_id)
  );

-- ── Gate 2: confirming the payment ──────────────────────────────
-- Unchanged from 20260716154206 apart from the two role gates, which now ask can_settle_payments()
-- instead of testing caller_role against a hard-coded list. Refunds are untouched: they stay with
-- developer, owner and manager, because handing money back is not a counter decision.
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
      and not public.can_settle_payments(new.store_id) then
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
      and not public.can_settle_payments(new.store_id) then
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

-- ── The audit trail, re-asserted ────────────────────────────────
-- Live behaviour disagreed with every migration in this repository: signed in as the kitchen
-- account, every activity_log insert came back 42501 "new row violates row-level security policy",
-- while `has_staff_role(store_id, <the list the policy is supposed to hold>)` returned true for the
-- same session and the same owner insert cleared RLS. The only explanation is that the deployed
-- policy is not the one 20260802160000 writes. Rather than guess how it drifted, state it again.
--
-- The consequence while it is wrong is quiet: a kitchen or express device's sign-ins, shift starts
-- and order events never reach the cloud, so the owner's activity feed is missing exactly the
-- people who are not sitting at the till.
drop policy if exists "staff access activity_log" on public.activity_log;
drop policy if exists "staff insert activity_log" on public.activity_log;
create policy "staff insert activity_log" on public.activity_log
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff access audit_events" on public.audit_events;
drop policy if exists "staff insert audit_events" on public.audit_events;
create policy "staff insert audit_events" on public.audit_events
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

-- ── The eighth role, re-asserted ────────────────────────────────
-- Same reasoning: 20260802160000 widens both CHECK constraints to admit `temporary_staff`, and
-- there is no evidence it ran. Without it the express-only role cannot be saved at all — the local
-- row is written, Postgres refuses it, and the account looks created but does not work. These
-- statements are safe to repeat.
alter table public.staff
  drop constraint if exists staff_role_check;
alter table public.staff
  add constraint staff_role_check
  check (role in ('developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff'));

alter table public.staff_memberships
  drop constraint if exists staff_memberships_role_check;
alter table public.staff_memberships
  add constraint staff_memberships_role_check
  check (role in ('developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff'));

-- ── What actually landed ────────────────────────────────────────
-- Read this result before believing the migration worked. Each row should show the express-access
-- clause; `staff insert activity_log` should list all eight roles.
select tablename, policyname, cmd, coalesce(qual, with_check) as expression
from pg_policies
where schemaname = 'public'
  and policyname in ('staff insert orders', 'staff write tables', 'staff insert activity_log', 'staff insert audit_events')
order by tablename, policyname;
