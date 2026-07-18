-- Order lifecycle transitions are enforced in Postgres so a modified client
-- cannot cancel or reopen orders by bypassing the UI.
create or replace function public.enforce_order_status_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status in ('completed', 'cancelled') then
    raise exception 'Terminal order status cannot be changed';
  end if;

  if not (
    (old.status = 'pending' and new.status in ('confirmed', 'cancelled'))
    or (old.status = 'confirmed' and new.status in ('preparing', 'cancelled'))
    or (old.status = 'preparing' and new.status in ('ready', 'cancelled'))
    or (old.status = 'ready' and new.status in ('completed', 'cancelled'))
  ) then
    raise exception 'Invalid order status transition from % to %', old.status, new.status;
  end if;

  if new.status = 'cancelled' then
    if old.payment_status = 'paid' then
      raise exception 'Paid orders must be refunded before cancellation';
    end if;

    if (select auth.uid()) is not null then
      caller_role := public.current_staff_role(new.store_id);
      if caller_role not in ('developer', 'owner', 'manager') then
        raise exception 'Role % cannot cancel orders', coalesce(caller_role, 'unknown');
      end if;
    end if;
  end if;

  return new;
end
$$;

revoke all on function public.enforce_order_status_transition() from public, anon, authenticated;

drop trigger if exists trg_enforce_order_status_transition on public.orders;
create trigger trg_enforce_order_status_transition
before update of status on public.orders
for each row execute function public.enforce_order_status_transition();
