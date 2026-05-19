create or replace function public.ensure_active_stock_product()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.products
    where id = new.product_id
      and active = true
  ) then
    raise exception 'Cannot add stock movement for inactive or missing product';
  end if;

  return new;
end;
$$;

drop trigger if exists stock_movements_active_product on public.stock_movements;

create trigger stock_movements_active_product
before insert on public.stock_movements
for each row
execute function public.ensure_active_stock_product();
