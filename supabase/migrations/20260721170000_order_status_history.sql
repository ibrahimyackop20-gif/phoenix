-- Additive order workflow support: history + optional status_reason.
-- Safe to run multiple times. Does not alter existing order creation flow.

alter table public.orders
  add column if not exists status_reason text null;

alter table public.orders
  add column if not exists cancelled_at timestamptz null;

alter table public.orders
  add column if not exists cancelled_by text null;

create table if not exists public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  action text not null,
  admin_id uuid null references public.profiles(id) on delete set null,
  admin_name text null,
  reason text null,
  created_at timestamptz not null default now()
);

create index if not exists order_status_history_order_id_idx
  on public.order_status_history (order_id, created_at desc);

alter table public.order_status_history enable row level security;

-- Admin can read/insert all history rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_status_history'
      and policyname = 'order_status_history_admin_all'
  ) then
    create policy order_status_history_admin_all
      on public.order_status_history
      for all
      using (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
        or auth.jwt() ->> 'email' = 'ibrahimyackop20@gmail.com'
      )
      with check (
        exists (
          select 1 from public.profiles p
          where p.id = auth.uid() and p.role = 'admin'
        )
        or auth.jwt() ->> 'email' = 'ibrahimyackop20@gmail.com'
      );
  end if;
end $$;

-- Customers can read history for their own orders
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'order_status_history'
      and policyname = 'order_status_history_owner_select'
  ) then
    create policy order_status_history_owner_select
      on public.order_status_history
      for select
      using (
        exists (
          select 1 from public.orders o
          where o.id = order_id and o.user_id = auth.uid()
        )
      );
  end if;
end $$;

comment on table public.order_status_history is
  'Audit log of admin (and system) order status actions with optional reason.';
