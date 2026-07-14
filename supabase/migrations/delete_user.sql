-- Migration: Create complete client-accessible secure user deletion trigger
-- This SQL should be executed in the Supabase SQL Editor.
-- Location: supabase/migrations/delete_user.sql

-- 1. Create a security definer function that bypasses RLS to delete a user's entire profile, storage, and Auth account.
CREATE OR REPLACE FUNCTION public.delete_user_account()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with elevated superuser privileges
SET search_path = public, auth, storage
AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Fetch the authenticated user's ID
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح: يجب أن تكون مسجلاً للدخول لتنفيذ هذا الإجراء.';
  END IF;

  -- A. Clean up storage files metadata associated with this user
  DELETE FROM storage.objects WHERE owner = current_user_id;

  -- B. Delete all database records owned by the user
  DELETE FROM public.cart_items WHERE user_id = current_user_id;
  DELETE FROM public.chat_messages WHERE sender_id = current_user_id;
  DELETE FROM public.delivery_addresses WHERE user_id = current_user_id;
  DELETE FROM public.notifications WHERE user_id = current_user_id;
  DELETE FROM public.orders WHERE user_id = current_user_id;
  DELETE FROM public.sales_orders WHERE user_id = current_user_id;
  DELETE FROM public.profiles WHERE id = current_user_id;

  -- C. Finally, delete the authenticated user record from Supabase Auth
  DELETE FROM auth.users WHERE id = current_user_id;
END;
$$;

-- 2. Grant execution permissions on this function to the authenticated user role
GRANT EXECUTE ON FUNCTION public.delete_user_account() TO authenticated;
