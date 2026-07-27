-- Remove legacy policies and callable privileged helpers that predate the
-- repository migration ledger, and normalize pgvector outside public.

create schema if not exists extensions;
alter extension vector set schema extensions;

create or replace function public.match_documents(
  query_embedding extensions.vector(384),
  match_threshold float,
  match_count integer,
  filter_store_id text
)
returns table (id uuid, content text, metadata jsonb, similarity float)
language sql
stable
security definer
set search_path = ''
as $$
  select
    d.id,
    d.content,
    d.metadata,
    (1 - (d.embedding operator(extensions.<=>) query_embedding))::float
  from public.document_embeddings d
  where d.store_id = filter_store_id
    and 1 - (d.embedding operator(extensions.<=>) query_embedding) > match_threshold
  order by d.embedding operator(extensions.<=>) query_embedding
  limit least(greatest(match_count, 1), 20)
$$;
revoke all on function public.match_documents(extensions.vector, float, integer, text)
  from public, anon, authenticated;
grant execute on function public.match_documents(extensions.vector, float, integer, text)
  to service_role;

drop policy if exists "authenticated staff full access activity_log" on public.activity_log;
drop policy if exists "authenticated staff full access customers" on public.customers;
drop policy if exists "authenticated staff full access inventory" on public.inventory;
drop policy if exists "authenticated staff full access menu_categories" on public.menu_categories;
drop policy if exists "authenticated staff full access menu_items" on public.menu_items;
drop policy if exists "authenticated staff full access orders" on public.orders;
drop policy if exists "authenticated staff full access shifts" on public.shifts;
drop policy if exists "authenticated staff full access staff" on public.staff;
drop policy if exists "authenticated staff full access suppliers" on public.suppliers;
drop policy if exists "authenticated staff full access tables" on public.tables;

drop policy if exists "public menu categories read" on public.menu_categories;
drop policy if exists "public menu items read" on public.menu_items;
drop policy if exists "Allow public read access to menu images" on storage.objects;

create or replace function public.audit_order_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  change_details jsonb;
begin
  if old.status is distinct from new.status
    or old.payment_status is distinct from new.payment_status
    or old.total is distinct from new.total
  then
    change_details := jsonb_build_object(
      'old_status', old.status,
      'new_status', new.status,
      'old_payment_status', old.payment_status,
      'new_payment_status', new.payment_status,
      'old_total', old.total::text,
      'new_total', new.total::text
    );

    insert into public.audit_events (
      store_id,
      actor_staff_id,
      actor_auth_user_id,
      action,
      target_table,
      target_id,
      details
    )
    values (
      new.store_id,
      new.staff_id,
      new.auth_user_id,
      'order_update',
      'orders',
      new.id::text,
      change_details
    );
  end if;

  return new;
end
$$;
revoke all on function public.audit_order_changes() from public, anon, authenticated;

revoke all on function public.rls_auto_enable() from public, anon, authenticated;
drop function if exists public.prevent_modification();

drop index if exists public.idx_rate_limits_window;
