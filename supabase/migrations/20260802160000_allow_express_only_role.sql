-- Let the express-only role actually be stored.
--
-- `staff.role` and `staff_memberships.role` each carry a CHECK constraint
-- listing the seven original roles. `temporary_staff` — the express-only role
-- the app offers in both staff screens, routes to the Express Panel, and now
-- grants RLS to — is not among them, so the database rejects every attempt to
-- save it. The account appears to be created (the local row is written) and is
-- then refused by Postgres, which is exactly what "the other roles are
-- non-functional" looks like from the outside.
--
-- Both constraints are replaced rather than dropped: the role list is still
-- closed, it simply has the eighth role in it now.

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

-- The audit trail has the same gap. Every shift start, sign-in and order the
-- express-only role takes tries to append a row here; with the role missing
-- from the with-check list each one is refused, so the role works but leaves no
-- record — and any screen that reads back what it just wrote comes up empty.
drop policy if exists "staff insert activity_log" on public.activity_log;
create policy "staff insert activity_log" on public.activity_log
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

drop policy if exists "staff insert audit_events" on public.audit_events;
create policy "staff insert audit_events" on public.audit_events
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));
