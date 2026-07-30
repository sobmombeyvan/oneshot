-- Client tablet role: customers order from a table tablet.
-- Run in Supabase SQL Editor after 001_initial_schema.sql

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'client'
      AND enumtypid = 'public.user_role'::regtype
  ) THEN
    ALTER TYPE public.user_role ADD VALUE 'client';
  END IF;
END $$;

DROP POLICY IF EXISTS "Clients insert orders" ON public.orders;
CREATE POLICY "Clients insert orders"
  ON public.orders
  FOR INSERT
  WITH CHECK (public.get_user_role() = 'client');

DROP POLICY IF EXISTS "Clients insert order items" ON public.order_items;
CREATE POLICY "Clients insert order items"
  ON public.order_items
  FOR INSERT
  WITH CHECK (public.get_user_role() = 'client');

DROP POLICY IF EXISTS "Clients update tables" ON public.restaurant_tables;
CREATE POLICY "Clients update tables"
  ON public.restaurant_tables
  FOR UPDATE
  USING (public.get_user_role() = 'client');
