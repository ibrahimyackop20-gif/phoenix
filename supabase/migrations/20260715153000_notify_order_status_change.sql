-- Database-driven push notifications for print order status changes.
-- Invokes the existing Edge Function: send-push
-- Only fires when OLD.status IS DISTINCT FROM NEW.status.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, extensions
as $$
declare
  _service_role text;
  _status_ar text;
  _request_id bigint;
  _edge_url constant text := 'https://jyoqmpfwkzejnzwhhkpx.supabase.co/functions/v1/send-push';
begin
  -- Ignore no-op status updates (also covers any other column-only changes).
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.user_id is null then
    return new;
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

  _status_ar := case new.status
    when 'Pending' then 'قيد الانتظار'
    when 'Printing' then 'جاري الطباعة'
    when 'Completed' then 'مكتمل'
    when 'Cancelled' then 'ملغي'
    else coalesce(new.status, 'غير معروف')
  end;

  select net.http_post(
    url := _edge_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || _service_role
    ),
    body := jsonb_build_object(
      'user_id', new.user_id::text,
      'title', 'تحديث حالة الطلب',
      'body', 'تم تحديث حالة طلب الطباعة إلى: ' || _status_ar,
      'data', jsonb_build_object(
        'type', 'order_status',
        'order_id', new.id::text,
        'status', coalesce(new.status, ''),
        'route', '/dashboard/orders'
      )
    )
  ) into _request_id;

  return new;
end;
$$;

drop trigger if exists trg_notify_order_status_change on public.orders;

create trigger trg_notify_order_status_change
  after update on public.orders
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_order_status_change();

comment on function public.notify_order_status_change() is
  'Calls Edge Function send-push when public.orders.status changes.';
