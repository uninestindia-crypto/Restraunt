create index if not exists idx_customer_reviews_user_id
  on public.customer_reviews(user_id);

create index if not exists idx_customer_saved_addresses_user_id
  on public.customer_saved_addresses(user_id);

create index if not exists idx_recipes_menu_item_id
  on public.recipes(menu_item_id);

create index if not exists idx_reservations_customer_id
  on public.reservations(customer_id);

create index if not exists idx_reservations_table_id
  on public.reservations(table_id);

create index if not exists idx_shifts_staff_id
  on public.shifts(staff_id);

create index if not exists idx_staff_memberships_staff_id
  on public.staff_memberships(staff_id);
