-- Enhance cancel workflow: Accepted status, cancelled_by, push copy, Telegram ops alerts.
-- Does not alter existing order creation columns beyond additive fields.

alter table public.orders
  add column if not exists cancelled_at timestamptz null,
  add column if not exists cancelled_by text null;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'orders_cancelled_by_check'
  ) then
    alter table public.orders
      add constraint orders_cancelled_by_check
      check (cancelled_by is null or cancelled_by in ('customer', 'admin'));
  end if;
end $$;

comment on column public.orders.cancelled_by is
  'Who cancelled: customer (RPC) or admin (dashboard). Null if not cancelled.';

-- Stamp cancelled_by / cancelled_at for admin cancellations that skip the RPC.
create or replace function public.orders_stamp_cancellation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'Cancelled'
     and old.status is distinct from 'Cancelled' then
    if new.cancelled_by is null then
      new.cancelled_by := 'admin';
    end if;
    if new.cancelled_at is null then
      new.cancelled_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_stamp_cancellation on public.orders;
create trigger trg_orders_stamp_cancellation
  before update on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.orders_stamp_cancellation();

-- Harden customer cancel: Pending only; Reject Accepted / non-Pending.
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

  -- Admin acceptance (or any non-Pending status) permanently blocks customer cancel.
  if v_order.status = 'Accepted'
     or v_order.status = 'Printing'
     or v_order.status = 'Out for Delivery'
     or v_order.status = 'Completed'
     or v_order.status = 'Rejected' then
    return jsonb_build_object('success', false, 'error', 'already_accepted');
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
         cancelled_by = 'customer',
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
  'Owner cancel: Pending only, within 2 minutes, and not yet Accepted by admin.';

-- Push + Telegram on every status transition.
create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, extensions
as $$
declare
  _service_role text;
  _title text;
  _body text;
  _notification_id uuid;
  _request_id bigint;
  _edge_push constant text := 'https://jyoqmpfwkzejnzwhhkpx.supabase.co/functions/v1/send-push';
  _edge_tg constant text := 'https://jyoqmpfwkzejnzwhhkpx.supabase.co/functions/v1/notify-order-telegram';
  _profile_name text;
  _profile_phone text;
  _order_number text;
  _tg_event text;
  _skip_customer_push boolean := false;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  _order_number := upper(substr(new.id::text, 1, 8));

  select coalesce(p.full_name, 'Unknown'),
         coalesce(p.phone_number, '—')
    into _profile_name, _profile_phone
    from public.profiles p
   where p.id = new.user_id;

  _profile_name := coalesce(_profile_name, 'Unknown');
  _profile_phone := coalesce(_profile_phone, '—');

  -- Customer-facing push copy (English + Arabic).
  if new.status = 'Accepted' then
    _title := 'Order accepted';
    _body := 'Your order has been accepted and is now being processed. / تم قبول طلبك وأصبح قيد المعالجة.';
    _tg_event := 'accepted';
  elsif new.status = 'Rejected' then
    _title := 'Order rejected';
    _body := 'Your order has been rejected. / تم رفض طلبك.';
    _tg_event := 'rejected';
  elsif new.status = 'Cancelled' and coalesce(new.cancelled_by, 'admin') = 'admin' then
    _title := 'Order cancelled';
    _body := 'Your order has been cancelled by the administration. / تم إلغاء طلبك من قبل الإدارة.';
    _tg_event := 'admin_cancelled';
  elsif new.status = 'Cancelled' and new.cancelled_by = 'customer' then
    -- Customer initiated cancel — still confirm in-app, Telegram alert for ops.
    _title := 'Order cancelled';
    _body := 'Your order was cancelled successfully. / تم إلغاء طلبك بنجاح.';
    _tg_event := 'customer_cancelled';
  elsif new.status = 'Printing' then
    _title := 'Order update';
    _body := 'Your print order #' || _order_number || ' is now printing. / طلبك قيد الطباعة.';
    _tg_event := 'printing';
  elsif new.status = 'Out for Delivery' then
    _title := 'Order update';
    _body := 'Your order #' || _order_number || ' is out for delivery. / طلبك قيد التوصيل.';
    _tg_event := 'out_for_delivery';
  elsif new.status = 'Completed' then
    _title := 'Order completed';
    _body := 'Your order #' || _order_number || ' is completed. / اكتمل طلبك.';
    _tg_event := 'completed';
  elsif new.status = 'Pending' then
    _title := 'Order update';
    _body := 'Your order #' || _order_number || ' is pending. / طلبك قيد الانتظار.';
    _tg_event := 'pending';
  else
    _title := 'Order update';
    _body := 'Your order #' || _order_number || ' status: ' || coalesce(new.status, '');
    _tg_event := 'status';
  end if;

  if not _skip_customer_push then
    insert into public.notifications (
      user_id,
      title,
      message,
      is_read,
      created_at,
      order_id,
      type
    ) values (
      new.user_id,
      _title,
      _body,
      false,
      now(),
      new.id,
      'order_status'
    )
    returning id into _notification_id;
  end if;

  select ds.decrypted_secret
    into _service_role
  from vault.decrypted_secrets as ds
  where ds.name = 'service_role_key'
  limit 1;

  if _service_role is null or length(trim(_service_role)) = 0 then
    raise warning 'notify_order_status_change: vault secret service_role_key is missing';
    return new;
  end if;

  -- Customer push
  if not _skip_customer_push then
    select net.http_post(
      url := _edge_push,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role
      ),
      body := jsonb_build_object(
        'user_id', new.user_id::text,
        'title', _title,
        'body', _body,
        'data', jsonb_build_object(
          'type', 'order_status',
          'order_id', new.id::text,
          'notification_id', coalesce(_notification_id::text, ''),
          'status', coalesce(new.status, ''),
          'cancelled_by', coalesce(new.cancelled_by, ''),
          'route', '/dashboard/orders'
        )
      )
    ) into _request_id;
  end if;

  -- Ops Telegram (Accepted / Rejected / Cancelled — customer or admin)
  if _tg_event in ('accepted', 'rejected', 'admin_cancelled', 'customer_cancelled') then
    select net.http_post(
      url := _edge_tg,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || _service_role
      ),
      body := jsonb_build_object(
        'event', _tg_event,
        'order_id', new.id::text,
        'order_number', _order_number,
        'customer_name', _profile_name,
        'phone', _profile_phone,
        'status', coalesce(new.status, ''),
        'cancelled_by', coalesce(new.cancelled_by, ''),
        'time', to_char(timezone('utc', now()), 'YYYY-MM-DD HH24:MI:SS') || ' UTC'
      )
    ) into _request_id;
  end if;

  return new;
end;
$$;

comment on function public.notify_order_status_change() is
  'Push + in-app notification; Telegram ops alerts for Accepted/Rejected/Cancelled.';
