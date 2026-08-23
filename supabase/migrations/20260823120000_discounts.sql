-- Discounts, per line and per bill, computed where they cannot be argued with.
--
-- A discount is by definition a deviation from the menu price, and the menu price is the one thing
-- this schema refuses to take on trust: `enforce_order_integrity` rebuilds every line and every
-- money column from `menu_items` on insert, precisely so a client cannot dictate what a customer
-- pays. Anything a browser sends that the trigger does not know about is discarded — so a discount
-- bolted on in the app would be shown, printed, and then silently erased by the server, and the
-- customer would be charged full price.
--
-- So the rule is declared to the server and the money is worked out there. The client sends what
-- was *asked for* — 10% off this line, ₹50 off the bill — and the server decides what that is worth
-- against the live menu, clamps it, and writes the result.
--
-- The order of operations is the Indian invoice convention, and it is not arbitrary: a trade
-- discount reduces the taxable value, so GST is charged on what the customer actually pays.
--
--     subtotal        sum of menu price x quantity          (gross, unchanged meaning)
--   - item discounts  per line, clamped to that line
--   - bill discount   percent or amount, clamped to what is left
--   = taxable value
--   + GST             on the taxable value, not on the gross
--   + delivery fee
--   = total
--
-- `subtotal` deliberately stays gross. Every report that sums it keeps meaning gross sales, and the
-- money given away becomes its own line rather than disappearing into a smaller subtotal.

-- ── What an owner is willing to let staff give away ───────────────────────
alter table public.store_security_settings
  add column if not exists max_discount_percent numeric(5, 2) not null default 100.00
  check (max_discount_percent between 0 and 100);

comment on column public.store_security_settings.max_discount_percent is
  'Ceiling on the effective discount a cashier, waiter or express account may apply to one bill. Managers, owners and developers are not bound by it.';

grant select (store_id, gst_percent, delivery_fee, max_discount_percent, updated_at)
  on table public.store_security_settings to anon, authenticated;
grant update (gst_percent, delivery_fee, max_discount_percent, updated_at)
  on table public.store_security_settings to authenticated;

-- ── What was given away on this bill ──────────────────────────────────────
alter table public.orders
  add column if not exists item_discount_total numeric(10, 2) not null default 0
    check (item_discount_total >= 0),
  add column if not exists bill_discount_type text not null default 'none'
    check (bill_discount_type in ('none', 'percent', 'amount')),
  add column if not exists bill_discount_value numeric(10, 2) not null default 0
    check (bill_discount_value >= 0),
  add column if not exists bill_discount_amount numeric(10, 2) not null default 0
    check (bill_discount_amount >= 0),
  add column if not exists discount_total numeric(10, 2) not null default 0
    check (discount_total >= 0),
  add column if not exists discount_reason text not null default '';

comment on column public.orders.bill_discount_value is
  'What the operator entered — 10 for 10%, 50 for ₹50. bill_discount_amount is what the server made of it.';
comment on column public.orders.discount_total is
  'item_discount_total + bill_discount_amount. Subtracted from subtotal before GST.';

grant select, insert, update on table public.orders to authenticated;

-- ── The trigger, which is where a discount becomes money ──────────────────
-- Unchanged from 20260821120000 apart from the discount arithmetic. It still rebuilds every line
-- from the live menu; it now also reads the discount *rules* off the submitted lines and the order,
-- works out what they are worth, clamps them, and taxes the remainder.
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
  configured_max_discount numeric(5, 2) := 100.00;
  line_gross numeric(12, 2) := 0;
  line_discount numeric(12, 2) := 0;
  items_discount numeric(12, 2) := 0;
  bill_discount numeric(12, 2) := 0;
  after_item_discounts numeric(12, 2) := 0;
  taxable_value numeric(12, 2) := 0;
  effective_percent numeric(6, 3) := 0;
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

      line_gross := menu_row.price * item_quantity;

      -- The client says what was asked for; the value of it is decided here. A percentage is
      -- applied to the line's menu value, an amount is taken at face value, and either way the
      -- result cannot exceed the line or fall below zero — so "₹500 off a ₹80 chips" is ₹80 off,
      -- not a bill that owes the customer money.
      if coalesce(raw_item->>'discountPercent', '') <> '' then
        line_discount := round(line_gross * least(greatest((raw_item->>'discountPercent')::numeric, 0), 100) / 100, 2);
      elsif coalesce(raw_item->>'discountAmount', '') <> '' then
        line_discount := greatest((raw_item->>'discountAmount')::numeric, 0);
      else
        line_discount := 0;
      end if;
      line_discount := least(line_discount, line_gross);

      computed_subtotal := computed_subtotal + line_gross;
      items_discount := items_discount + line_discount;

      validated_items := validated_items || jsonb_build_array(jsonb_build_object(
        'itemId', menu_row.id,
        'itemName', menu_row.name,
        'price', menu_row.price,
        'quantity', item_quantity,
        'isVeg', menu_row.is_veg,
        'notes', left(coalesce(raw_item->>'notes', ''), 240),
        -- Both are kept: the rule, so a receipt can say "10% off", and the money, so nothing has to
        -- recompute it and risk disagreeing with the total.
        'discountPercent', case when coalesce(raw_item->>'discountPercent', '') <> ''
          then least(greatest((raw_item->>'discountPercent')::numeric, 0), 100) else null end,
        'discount', line_discount
      ));
    end loop;

    select s.gst_percent, s.delivery_fee, s.max_discount_percent
    into configured_tax, configured_delivery_fee, configured_max_discount
    from public.store_security_settings s
    where s.store_id = new.store_id;
    configured_tax := coalesce(configured_tax, 5.00);
    configured_delivery_fee := coalesce(configured_delivery_fee, 0.00);
    configured_max_discount := coalesce(configured_max_discount, 100.00);

    computed_subtotal := round(computed_subtotal, 2);
    items_discount := round(least(items_discount, computed_subtotal), 2);

    -- coalesce, deliberately: `null = any(array[...])` is NULL rather than false, and a NULL here
    -- would make `not <permission>` NULL too — so the guard would not fire and the discount would
    -- stand. On a money check the unknown answer has to be "no".
    if (items_discount > 0 or new.bill_discount_type <> 'none')
      and not coalesce(public.can_settle_payments(new.store_id), false) then
      raise exception 'Only staff who can take payment may apply a discount';
    end if;

    after_item_discounts := computed_subtotal - items_discount;

    -- The bill discount applies to what is left after the line discounts, so the two compose
    -- instead of double-counting. Same clamping: never negative, never more than is owed.
    if new.bill_discount_type = 'percent' then
      bill_discount := round(after_item_discounts * least(greatest(new.bill_discount_value, 0), 100) / 100, 2);
    elsif new.bill_discount_type = 'amount' then
      bill_discount := greatest(new.bill_discount_value, 0);
    else
      bill_discount := 0;
      new.bill_discount_value := 0;
    end if;
    bill_discount := least(bill_discount, after_item_discounts);

    -- The ceiling an owner sets is on the whole bill, not on one line, because otherwise it is
    -- trivially defeated by discounting every line a little. Managers are not bound by it: someone
    -- has to be able to make a complaint go away.
    if computed_subtotal > 0
      and not coalesce(public.has_staff_role(new.store_id, array['developer','owner','manager']), false)
      and (select auth.uid()) is not null then
      effective_percent := round((items_discount + bill_discount) * 100 / computed_subtotal, 3);
      if effective_percent > configured_max_discount then
        raise exception 'That discount is % percent of the bill, above the % percent this store allows. Ask a manager to apply it.',
          round(effective_percent, 2), round(configured_max_discount, 2);
      end if;
    end if;

    taxable_value := computed_subtotal - items_discount - bill_discount;

    new.items := validated_items;
    new.subtotal := computed_subtotal;
    new.item_discount_total := items_discount;
    new.bill_discount_amount := bill_discount;
    new.discount_total := items_discount + bill_discount;
    new.tax_percent := configured_tax;
    new.tax := round(taxable_value * configured_tax / 100, 2);
    new.delivery_fee := case when new.type = 'delivery' then configured_delivery_fee else 0 end;
    new.total := taxable_value + new.tax + new.delivery_fee;
    new.discount_reason := left(coalesce(new.discount_reason, ''), 160);
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
      and not coalesce(public.can_settle_payments(new.store_id), false) then
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
      or new.item_discount_total is distinct from old.item_discount_total
      or new.bill_discount_type is distinct from old.bill_discount_type
      or new.bill_discount_value is distinct from old.bill_discount_value
      or new.bill_discount_amount is distinct from old.bill_discount_amount
      or new.discount_total is distinct from old.discount_total
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
      and not coalesce(public.can_settle_payments(new.store_id), false) then
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

-- ── What actually landed ──────────────────────────────────────────────────
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'orders'
  and column_name in ('item_discount_total','bill_discount_type','bill_discount_value','bill_discount_amount','discount_total','discount_reason')
order by column_name;
