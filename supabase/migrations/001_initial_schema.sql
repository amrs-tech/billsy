create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'cashier');
create type public.stock_movement_type as enum ('inward', 'sale', 'adjustment', 'cancellation');
create type public.invoice_status as enum ('saved', 'cancelled');
create type public.payment_mode as enum ('cash', 'upi', 'card', 'mixed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  role public.user_role not null default 'cashier',
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  barcode text not null unique,
  sku text not null unique,
  name text not null,
  category text not null default 'General',
  hsn text not null default '',
  unit text not null default 'pcs',
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0 and gst_rate <= 28),
  mrp numeric(12,2) not null default 0 check (mrp >= 0),
  selling_price numeric(12,2) not null default 0 check (selling_price >= 0),
  reorder_level numeric(12,3) not null default 0 check (reorder_level >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id),
  type public.stock_movement_type not null,
  quantity numeric(12,3) not null check (quantity <> 0),
  reference text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer jsonb not null default '{}'::jsonb,
  bill_discount jsonb not null default '{"type":"amount","value":0}'::jsonb,
  subtotal numeric(12,2) not null,
  line_discount_total numeric(12,2) not null,
  bill_discount_amount numeric(12,2) not null,
  taxable_value numeric(12,2) not null,
  cgst numeric(12,2) not null,
  sgst numeric(12,2) not null,
  igst numeric(12,2) not null,
  grand_total numeric(12,2) not null,
  payment_mode public.payment_mode not null default 'cash',
  status public.invoice_status not null default 'saved',
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id)
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_snapshot jsonb not null,
  quantity numeric(12,3) not null check (quantity > 0),
  unit_price numeric(12,2) not null check (unit_price >= 0),
  discount_amount numeric(12,2) not null default 0,
  taxable_value numeric(12,2) not null default 0,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  igst numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0
);

create table public.app_settings (
  id boolean primary key default true,
  business_name text not null default 'Billsy Store',
  gstin text not null default '',
  address text not null default '',
  state text not null default 'Kerala',
  invoice_prefix text not null default 'BIL',
  receipt_size text not null default 'a4' check (receipt_size in ('a4', 'thermal-80', 'thermal-58')),
  updated_at timestamptz not null default now(),
  constraint app_settings_single_row check (id)
);

insert into public.app_settings (id) values (true) on conflict do nothing;

create view public.stock_on_hand as
select
  p.id as product_id,
  coalesce(sum(sm.quantity), 0) as quantity
from public.products p
left join public.stock_movements sm on sm.product_id = p.id
group by p.id;

create or replace function public.current_user_role()
returns public.user_role
language sql
security definer
stable
as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.next_invoice_number(prefix text)
returns text
language plpgsql
as $$
declare
  next_count integer;
begin
  select count(*) + 1 into next_count from public.invoices where invoice_number like prefix || '-%';
  return prefix || '-' || to_char(now(), 'YYYYMMDD') || '-' || lpad(next_count::text, 4, '0');
end;
$$;

create or replace function public.save_invoice(payload jsonb)
returns uuid
language plpgsql
security definer
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

alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.stock_movements enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.app_settings enable row level security;

create policy "profiles read own or admin" on public.profiles
for select using (id = auth.uid() or public.current_user_role() = 'admin');

create policy "settings read authenticated" on public.app_settings
for select using (auth.uid() is not null);

create policy "settings admin update" on public.app_settings
for update using (public.current_user_role() = 'admin');

create policy "products read authenticated" on public.products
for select using (auth.uid() is not null);

create policy "products admin write" on public.products
for all using (public.current_user_role() = 'admin') with check (public.current_user_role() = 'admin');

create policy "stock read authenticated" on public.stock_movements
for select using (auth.uid() is not null);

create policy "stock admin write" on public.stock_movements
for insert with check (public.current_user_role() = 'admin');

create policy "invoices read authenticated" on public.invoices
for select using (auth.uid() is not null);

create policy "invoice items read authenticated" on public.invoice_items
for select using (auth.uid() is not null);

grant execute on function public.save_invoice(jsonb) to authenticated;
