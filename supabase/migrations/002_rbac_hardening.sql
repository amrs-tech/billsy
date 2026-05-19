create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text;
begin
  requested_role := coalesce(new.raw_user_meta_data->>'role', 'cashier');

  insert into public.profiles (id, name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(coalesce(new.email, ''), '@', 1), 'User'),
    case
      when requested_role in ('admin', 'cashier') then requested_role::public.user_role
      else 'cashier'::public.user_role
    end
  )
  on conflict (id) do update
  set name = excluded.name;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

insert into public.profiles (id, name, role)
select
  u.id,
  coalesce(u.raw_user_meta_data->>'name', split_part(coalesce(u.email, ''), '@', 1), 'User'),
  'cashier'::public.user_role
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

create or replace function public.save_invoice(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  invoice_id uuid := gen_random_uuid();
  item jsonb;
  stock_qty numeric;
  invoice_no text;
  product_row public.products%rowtype;
  line_qty numeric;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'Profile missing for authenticated user';
  end if;

  invoice_no := public.next_invoice_number(coalesce(payload->>'invoicePrefix', 'BIL'));

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    line_qty := (item->>'quantity')::numeric;
    select * into product_row from public.products where id = (item->'product'->>'id')::uuid for update;
    if product_row.id is null or product_row.active = false then
      raise exception 'Product is inactive or missing';
    end if;

    select coalesce(sum(quantity), 0) into stock_qty
    from public.stock_movements
    where product_id = product_row.id;

    if stock_qty < line_qty then
      raise exception 'Insufficient stock for %', product_row.name;
    end if;
  end loop;

  insert into public.invoices (
    id, invoice_number, customer, bill_discount, subtotal, line_discount_total,
    bill_discount_amount, taxable_value, cgst, sgst, igst, grand_total,
    payment_mode, created_by
  )
  values (
    invoice_id,
    invoice_no,
    payload->'customer',
    payload->'billDiscount',
    (payload->'totals'->>'subtotal')::numeric,
    (payload->'totals'->>'lineDiscountTotal')::numeric,
    (payload->'totals'->>'billDiscountAmount')::numeric,
    (payload->'totals'->>'taxableValue')::numeric,
    (payload->'totals'->>'cgst')::numeric,
    (payload->'totals'->>'sgst')::numeric,
    (payload->'totals'->>'igst')::numeric,
    (payload->'totals'->>'grandTotal')::numeric,
    (payload->>'paymentMode')::public.payment_mode,
    auth.uid()
  );

  for item in select * from jsonb_array_elements(payload->'items')
  loop
    insert into public.invoice_items (
      invoice_id, product_id, product_snapshot, quantity, unit_price, discount_amount,
      taxable_value, cgst, sgst, igst, total
    )
    values (
      invoice_id,
      (item->'product'->>'id')::uuid,
      item->'product',
      (item->>'quantity')::numeric,
      (item->>'unitPrice')::numeric,
      (item->>'discountAmount')::numeric,
      (item->>'taxableValue')::numeric,
      (item->>'cgst')::numeric,
      (item->>'sgst')::numeric,
      (item->>'igst')::numeric,
      (item->>'total')::numeric
    );

    insert into public.stock_movements (product_id, type, quantity, reference, notes, created_by)
    values (
      (item->'product'->>'id')::uuid,
      'sale',
      -1 * (item->>'quantity')::numeric,
      invoice_no,
      'Invoice sale',
      auth.uid()
    );
  end loop;

  return invoice_id;
end;
$$;

drop policy if exists "settings admin update" on public.app_settings;
create policy "settings admin update" on public.app_settings
for update using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

create policy "settings admin insert" on public.app_settings
for insert with check (public.current_user_role() = 'admin');

create policy "profiles admin update" on public.profiles
for update using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

drop policy if exists "invoices read authenticated" on public.invoices;
create policy "invoices read own or admin" on public.invoices
for select using (created_by = auth.uid() or public.current_user_role() = 'admin');

drop policy if exists "invoice items read authenticated" on public.invoice_items;
create policy "invoice items read own invoice or admin" on public.invoice_items
for select using (
  public.current_user_role() = 'admin'
  or exists (
    select 1
    from public.invoices i
    where i.id = invoice_items.invoice_id
      and i.created_by = auth.uid()
  )
);
