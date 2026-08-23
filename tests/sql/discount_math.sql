-- What a discount is worth, asserted against the trigger that decides it.
--
-- Every case here is a bill someone could ring up. The numbers on the right are what the customer
-- should be charged, worked out by hand — if the trigger disagrees, the test says so and names the
-- column, because "the total looked about right" is not a standard for money.

\set ON_ERROR_STOP on
\pset pager off

create or replace function _as(p_role text) returns void language sql as $$
  update auth._current set uid = case when p_role is null then null else gen_random_uuid() end, role = p_role $$;

create or replace function _ring(
  p_items jsonb,
  p_bill_type text default 'none',
  p_bill_value numeric default 0,
  p_type text default 'takeaway'
) returns public.orders language plpgsql as $$
declare o public.orders;
begin
  insert into public.orders (order_number, items, bill_discount_type, bill_discount_value, type, subtotal, tax, total)
  values ('TT-' || floor(random() * 1e9)::text, p_items, p_bill_type, p_bill_value, p_type, 0, 0, 0)
  returning * into o;
  return o;
end $$;

create or replace function _expect(label text, got numeric, want numeric) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception '% : expected %, got %', label, want, got;
  end if;
  raise notice 'ok   %  = %', rpad(label, 46), got;
end $$;

do $$
declare o public.orders;
begin
  perform _as('cashier');

  -- ── No discount: the arithmetic that already existed, unchanged. ─────────
  o := _ring('[{"itemId":1,"quantity":2}]');                      -- 2 x 80 = 160, +5% = 168
  perform _expect('plain: subtotal',        o.subtotal,            160.00);
  perform _expect('plain: discount total',  o.discount_total,        0.00);
  perform _expect('plain: tax',             o.tax,                   8.00);
  perform _expect('plain: total',           o.total,               168.00);

  -- ── Per line, as a percentage. ───────────────────────────────────────────
  o := _ring('[{"itemId":1,"quantity":2,"discountPercent":10}]');  -- 160 - 16 = 144, +5% = 151.20
  perform _expect('line 10%: subtotal stays gross', o.subtotal,    160.00);
  perform _expect('line 10%: item discount', o.item_discount_total, 16.00);
  perform _expect('line 10%: tax on the net', o.tax,                7.20);
  perform _expect('line 10%: total',         o.total,             151.20);
  perform _expect('line 10%: kept on the line',
    (o.items -> 0 ->> 'discount')::numeric, 16.00);

  -- ── Per line, as an amount, on one of two lines. ─────────────────────────
  o := _ring('[{"itemId":1,"quantity":1,"discountAmount":20},{"itemId":3,"quantity":1}]');
  perform _expect('line ₹20: subtotal',      o.subtotal,           200.00);   -- 80 + 120
  perform _expect('line ₹20: item discount', o.item_discount_total, 20.00);
  perform _expect('line ₹20: total',         o.total,              189.00);   -- 180 + 9

  -- ── Whole bill, as a percentage. ─────────────────────────────────────────
  o := _ring('[{"itemId":2,"quantity":2}]', 'percent', 25);        -- 180 - 45 = 135, +5% = 141.75
  perform _expect('bill 25%: bill discount', o.bill_discount_amount, 45.00);
  perform _expect('bill 25%: discount total', o.discount_total,     45.00);
  perform _expect('bill 25%: total',          o.total,             141.75);

  -- ── Whole bill, as an amount. ────────────────────────────────────────────
  o := _ring('[{"itemId":3,"quantity":1}]', 'amount', 20);         -- 120 - 20 = 100, +5% = 105
  perform _expect('bill ₹20: total',          o.total,             105.00);

  -- ── Both together: the bill discount applies to what is left. ────────────
  -- 160 gross, 16 off the line, 144 left, 10% of that is 14.40 -> 129.60 + 5% = 136.08
  o := _ring('[{"itemId":1,"quantity":2,"discountPercent":10}]', 'percent', 10);
  perform _expect('both: item discount',      o.item_discount_total, 16.00);
  perform _expect('both: bill discount',      o.bill_discount_amount, 14.40);
  perform _expect('both: discount total',     o.discount_total,      30.40);
  perform _expect('both: total',              o.total,              136.08);

  -- ── Nothing can make a bill owe the customer money. ──────────────────────
  o := _ring('[{"itemId":1,"quantity":1,"discountAmount":500}]');  -- ₹500 off ₹80
  perform _expect('over-discount line: clamped', o.item_discount_total, 80.00);
  perform _expect('over-discount line: total',   o.total,                0.00);

  o := _ring('[{"itemId":1,"quantity":1}]', 'amount', 500);
  perform _expect('over-discount bill: clamped', o.bill_discount_amount, 80.00);
  perform _expect('over-discount bill: total',   o.total,                0.00);

  o := _ring('[{"itemId":1,"quantity":1,"discountPercent":-30}]');
  perform _expect('negative percent is nothing', o.item_discount_total,  0.00);
  perform _expect('negative percent: total',     o.total,               84.00);

  -- ── A delivery fee is charged on top, never discounted away. ─────────────
  update public.store_security_settings set delivery_fee = 40 where store_id = 'the-taste';
  o := _ring('[{"itemId":1,"quantity":1}]', 'percent', 100, 'delivery');
  perform _expect('free food, paid delivery',    o.total,               40.00);
  update public.store_security_settings set delivery_fee = 0 where store_id = 'the-taste';

  raise notice '';
  raise notice 'all discount arithmetic agrees';
end $$;

-- ── Who is allowed to give money away ──────────────────────────────────────
create or replace function _refused(label text, sql text) returns void language plpgsql as $$
declare msg text;
begin
  begin
    execute sql;
  exception when others then
    raise notice 'ok   %  refused: %', rpad(label, 40), left(sqlerrm, 64);
    return;
  end;
  raise exception '% : the server ACCEPTED this and should not have', label;
end $$;

do $$
declare o public.orders;
begin
  -- A guest ordering from the storefront has no staff role. Without this they could send
  -- discountPercent: 100 on every line and eat for nothing.
  perform _as(null);
  perform _refused('guest, per-line discount',
    $q$ select _ring('[{"itemId":1,"quantity":1,"discountPercent":100}]') $q$);
  perform _refused('guest, whole-bill discount',
    $q$ select _ring('[{"itemId":1,"quantity":1}]', 'percent', 50) $q$);

  -- But an ordinary guest order still goes through untouched.
  o := _ring('[{"itemId":1,"quantity":1}]');
  perform _expect('guest, no discount: total', o.total, 84.00);

  -- A signed-in customer is not staff either.
  perform _as('customer');
  perform _refused('customer discounting their own bill',
    $q$ select _ring('[{"itemId":1,"quantity":1}]', 'amount', 40) $q$);

  -- ── The ceiling an owner sets ────────────────────────────────────────────
  update public.store_security_settings set max_discount_percent = 20 where store_id = 'the-taste';

  perform _as('cashier');
  o := _ring('[{"itemId":1,"quantity":1}]', 'percent', 20);
  perform _expect('cashier at the limit',      o.bill_discount_amount, 16.00);
  perform _refused('cashier over the limit',
    $q$ select _ring('[{"itemId":1,"quantity":1}]', 'percent', 25) $q$);

  -- The cap is on the bill, so discounting every line a little does not slip past it.
  perform _refused('cashier splitting it across lines',
    $q$ select _ring('[{"itemId":1,"quantity":1,"discountPercent":25},{"itemId":2,"quantity":1,"discountPercent":25}]') $q$);

  -- A manager has to be able to make a complaint go away.
  perform _as('manager');
  o := _ring('[{"itemId":1,"quantity":1}]', 'percent', 100);
  perform _expect('manager past the limit',    o.total,                 0.00);

  update public.store_security_settings set max_discount_percent = 100 where store_id = 'the-taste';
  raise notice '';
  raise notice 'all discount permissions hold';
end $$;
