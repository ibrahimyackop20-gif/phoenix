-- Migration: Create public.delete_user_account() SECURITY DEFINER RPC
-- This RPC deletes database rows and storage metadata references, returning true on success.
-- Location: supabase/migrations/delete_user.sql

CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated superuser privileges
SET search_path = public, storage
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Fetch the authenticated user's ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح: يجب أن تكون مسجلاً للدخول لتنفيذ هذا الإجراء.';
  END IF;

  -- A. Clean up storage files metadata references associated with this user
  DELETE FROM storage.objects WHERE owner = current_user_id;

  -- B. Delete all database records owned by the user
  DELETE FROM public.cart_items WHERE user_id = current_user_id;
  DELETE FROM public.chat_messages WHERE sender_id = current_user_id;
  DELETE FROM public.delivery_addresses WHERE user_id = current_user_id;
  DELETE FROM public.notifications WHERE user_id = current_user_id;
  DELETE FROM public.orders WHERE user_id = current_user_id;
  DELETE FROM public.sales_orders WHERE user_id = current_user_id;
  DELETE FROM public.profiles WHERE id = current_user_id;

  RETURN true;
END;
$$;

-- Grant execution permissions to the authenticated user role
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
