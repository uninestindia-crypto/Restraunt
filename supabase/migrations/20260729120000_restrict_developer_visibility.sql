-- Restrict developer account visibility on the staff roster.
--
-- Before this migration "managers read staff roster" granted developers, owners
-- and managers select on every row of public.staff, so a developer account was
-- readable by owners and managers even though only developers may modify it.
-- Hiding the row in the UI alone is not enough: the row still reaches the client
-- cache through the initial pull and through realtime postgres_changes, both of
-- which are evaluated against this select policy.
--
-- After this migration only developers can read developer rows. Every other role
-- sees the rest of the roster exactly as before, and the separate
-- "staff read own profile" policy still lets a developer read their own record.
--
-- The last-active-developer guard deliberately lives in the staff-admin edge
-- function rather than in a trigger here, mirroring the last-active-owner guard,
-- so that direct database access stays available as a recovery path.

drop policy if exists "managers read staff roster" on public.staff;
create policy "managers read staff roster" on public.staff
  for select to authenticated
  using (
    public.has_staff_role(store_id, array['developer', 'owner', 'manager'])
    and (
      staff.role <> 'developer'
      or public.has_staff_role(store_id, array['developer'])
    )
  );
