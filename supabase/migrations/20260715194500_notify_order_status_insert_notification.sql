-- Insert in-app notification rows on order status change (same trigger as push).
-- Extends existing public.notifications model; does not create a new table.
-- Keep send-push behavior unchanged.

alter table public.notifications
  add column if not exists order_id uuid null,
  add column if not exists type text null;

comment on column public.notifications.order_id is
  'Optional related order (print order UUID) for deep links.';
comment on column public.notifications.type is
  'Optional notification category, e.g. order_status.';

create or replace function public.notify_order_status_change()
returns trigger
language plpgsql
security definer
set search_path = public, net, vault, extensions
as $$
declare
  _service_role text;
  _status_ar text;
  _title text;
  _body text;
  _notification_id uuid;
  _request_id bigint;
  _edge_url constant text := 'https://jyoqmpfwkzejnzwhhkpx.supabase.co/functions/v1/send-push';
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  if new.user_id is null then
    return new;
  end if;

  _status_ar := case new.status
    when 'Pending' then 'قيد الانتظار'
    when 'Printing' then 'جاري الطباعة'
    when 'Completed' then 'مكتمل'
    when 'Cancelled' then 'ملغي'
    else coalesce(new.status, 'غير معروف')
  end;

  _title := 'تحديث حالة الطلب';
  -- Existing app deep-link parser looks for #XXXXXXXX (first 8 chars of UUID).
  _body := 'تم تحديث حالة طلب الطباعة #' ||
           upper(substr(new.id::text, 1, 8)) ||
           ' إلى: ' || _status_ar;

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

  select ds.decrypted_secret
    into _service_role
  from vault.decrypted_secrets as ds
  where ds.name = 'service_role_key'
  limit 1;

  if _service_role is null or length(trim(_service_role)) = 0 then
    raise warning 'notify_order_status_change: vault secret service_role_key is missing';
    return new;
  end if;

  select net.http_post(
    url := _edge_url,
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
        'route', '/dashboard/orders'
      )
    )
  ) into _request_id;

  return new;
end;
$$;

comment on function public.notify_order_status_change() is
  'Inserts into public.notifications then calls send-push when public.orders.status changes.';
