-- Grant the express-only staff role the access its one screen needs.
--
-- `temporary_staff` already existed in the app: the router lets it reach the
-- Express Panel and the Help Center and nothing else, the sidebar hides every
-- other destination, and the cloud pull narrows to the kitchen tables. But the
-- role appeared in no RLS policy, so such an account signed in successfully and
-- then saw an empty panel — every read denied — and could not bank an order.
--
-- The grants below are exactly what that one screen does: read the menu, take
-- and progress orders, see the floor, and let a sale deplete stock. Everything
-- else stays shut, including cancelling an order: the order-status trigger
-- keeps that to developer, owner and manager.

-- ── Menu: read only ─────────────────────────────────────────────
drop policy if exists "staff read menu_categories" on public.menu_categories;
create policy "staff read menu_categories" on public.menu_categories
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff read menu_items" on public.menu_items;
create policy "staff read menu_items" on public.menu_items
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff read menu_item_addons" on public.menu_item_addons;
create policy "staff read menu_item_addons" on public.menu_item_addons
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

-- ── Orders: take them and move them through the kitchen ─────────
drop policy if exists "staff read orders" on public.orders;
create policy "staff read orders" on public.orders
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff insert orders" on public.orders;
create policy "staff insert orders" on public.orders
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']));

drop policy if exists "staff update orders" on public.orders;
create policy "staff update orders" on public.orders
  for update to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

-- ── Floor: seat a dine-in order ─────────────────────────────────
drop policy if exists "staff write tables" on public.tables;
create policy "staff write tables" on public.tables
  for all to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']))
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','waiter','temporary_staff']));

-- ── Stock: read for the checkout lockout, deplete on a sale ─────
-- Selling has to be able to reduce stock, or every express sale leaves a
-- rejected inventory write queued on the device forever. Managing stock —
-- adding items, restocking, deleting — stays with managers.
drop policy if exists "staff read inventory" on public.inventory;
create policy "staff read inventory" on public.inventory
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','temporary_staff']));

drop policy if exists "express staff deplete inventory" on public.inventory;
create policy "express staff deplete inventory" on public.inventory
  for update to authenticated
  using (public.has_staff_role(store_id, array['cashier','waiter','kitchen','temporary_staff']))
  with check (public.has_staff_role(store_id, array['cashier','waiter','kitchen','temporary_staff']));

-- Recipes drive that deduction, so they have to be readable.
drop policy if exists "staff read recipes" on public.recipes;
create policy "staff read recipes" on public.recipes
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','temporary_staff']));

-- ── Table-level grants, the layer in front of RLS ───────────────
grant select on table public.menu_item_addons to authenticated;
grant update on table public.inventory to authenticated;
grant select on table public.recipes to authenticated;
