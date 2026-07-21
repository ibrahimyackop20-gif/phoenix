-- User-initiated print order cancellation within 2 minutes of creation.
-- Uses server timestamps (now()) — device clock cannot bypass the window.

alter table public.orders
  add column if not exists cancelled_at timestamptz null;

comment on column public.orders.cancelled_at is
  'Server timestamp when the order owner cancelled a Pending print order.';

-- Lightweight server clock for client countdown sync (no device-time trust).
create or replace function public.get_server_timestamp()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

revoke all on function public.get_server_timestamp() from public;
grant execute on function public.get_server_timestamp() to authenticated;

-- Cancel a print order (owner only, Pending only, within 2 minutes of created_at).
create or replace function public.cancel_print_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.orders%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('success', false, 'error', 'not_authenticated');
  end if;

  if p_order_id is null then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  select *
    into v_order
    from public.orders
   where id = p_order_id
     for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'not_found');
  end if;

  if v_order.user_id is distinct from auth.uid() then
    return jsonb_build_object('success', false, 'error', 'forbidden');
  end if;

  if v_order.status = 'Cancelled' then
    return jsonb_build_object('success', false, 'error', 'already_cancelled');
  end if;

  if v_order.status is distinct from 'Pending' then
    return jsonb_build_object('success', false, 'error', 'invalid_status');
  end if;

  if v_order.created_at + interval '2 minutes' <= now() then
    return jsonb_build_object('success', false, 'error', 'expired');
  end if;

  update public.orders
     set status = 'Cancelled',
         cancelled_at = now(),
         updated_at = now()
   where id = p_order_id;

  return jsonb_build_object(
    'success', true,
    'cancelled_at', now()
  );
end;
$$;

revoke all on function public.cancel_print_order(uuid) from public;
grant execute on function public.cancel_print_order(uuid) to authenticated;

comment on function public.cancel_print_order(uuid) is
  'Allows the order owner to cancel a Pending print order within 2 minutes of created_at (server time).';
