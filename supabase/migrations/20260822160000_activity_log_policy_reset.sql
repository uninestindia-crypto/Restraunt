-- Make the audit log's policies match this repository, whatever they are now.
--
-- 20260822 restated `staff insert activity_log` with all eight roles in it. It ran — the functions
-- and policies from the same transaction are live and working — and a kitchen account is *still*
-- refused:
--
--   POST /rest/v1/activity_log -> 403
--   {"code":"42501","message":"new row violates row-level security policy for table activity_log"}
--
-- while, in the same session, `has_staff_role(store_id, <the list that policy now holds>)` returns
-- true and the same insert as the owner clears RLS. A permissive policy that passes cannot produce
-- that. Something else on the table is voting no — most likely a RESTRICTIVE policy added by hand
-- in the dashboard, which no migration here would ever drop because nothing here knows its name.
--
-- So this stops guessing at names. It records what is there, removes every policy on the table, and
-- puts back the two this product actually wants. The whole thing is one transaction, so there is no
-- moment where the table is unprotected.
--
-- The consequence while it is broken is quiet but real: a kitchen or express device's sign-ins,
-- shift starts and order events never reach the cloud, so the owner's activity feed is missing
-- exactly the people who are not standing at the till.

-- ── Keep a copy of what was there, so the answer is not lost ──────────────
create temporary table _policies_before on commit drop as
select policyname, permissive, cmd, roles::text as roles,
       coalesce(qual, '') as using_expr, coalesce(with_check, '') as check_expr
from pg_policies
where schemaname = 'public' and tablename = 'activity_log';

-- ── Clear the table's policies completely ────────────────────────────────
do $$
declare
  policy_name text;
begin
  for policy_name in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'activity_log'
  loop
    execute format('drop policy %I on public.activity_log', policy_name);
  end loop;
end
$$;

-- ── Put back exactly two ─────────────────────────────────────────────────
-- Append-only by design: every staff role may add a line, only the people who run the restaurant
-- may read it back, and nobody may change or remove one. Update and delete stay blocked by
-- trg_prevent_mod_activity_log and by the absence of any grant, which is why there is no policy
-- for them here.
create policy "staff insert activity_log" on public.activity_log
  for insert to authenticated
  with check (public.has_staff_role(store_id, array['developer','owner','manager','cashier','kitchen','waiter','delivery','temporary_staff']));

create policy "managers read activity_log" on public.activity_log
  for select to authenticated
  using (public.has_staff_role(store_id, array['developer','owner','manager']));

-- ── Tidy one row this investigation left behind ──────────────────────────
-- A probe written while checking that store_settings accepted a manager's write. Nothing reads it.
delete from public.store_settings where store_id = 'the-taste' and key = 'qa_probe';

-- ── Before and after, side by side ───────────────────────────────────────
-- Read the "before" rows: they name whatever was refusing the insert. If one of them says
-- RESTRICTIVE, that was the cause and it is now gone.
select 'before' as state, policyname, permissive, cmd, roles, using_expr, check_expr
from _policies_before
union all
select 'after', policyname, permissive, cmd, roles::text,
       coalesce(qual, ''), coalesce(with_check, '')
from pg_policies
where schemaname = 'public' and tablename = 'activity_log'
order by state desc, policyname;
