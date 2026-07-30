-- Notify the main system whenever an order arrives (POS, tablet or public menu).
-- Run in Supabase SQL Editor after 004_public_menu_order.sql

-- 1) Staff must be able to mark shared notifications (user_id IS NULL) as read
DROP POLICY IF EXISTS "Users update own notifications" ON public.notifications;
CREATE POLICY "Users update own notifications"
  ON public.notifications
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid() OR user_id IS NULL)
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

-- 2) One notification per new order
CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_source TEXT;
BEGIN
  v_source := CASE
    WHEN COALESCE(NEW.notes, '') ILIKE '%menu public%' THEN 'Menu public'
    WHEN COALESCE(NEW.notes, '') ILIKE '%tablette%' THEN 'Tablette client'
    ELSE 'Caisse'
  END;

  INSERT INTO public.notifications (user_id, title, message, type, read, data)
  VALUES (
    NULL,
    'Nouvelle commande — Table ' || COALESCE(NEW.table_number::TEXT, '—'),
    v_source || ' · ' || ROUND(COALESCE(NEW.total, 0))::BIGINT::TEXT || ' FCFA',
    'order',
    FALSE,
    jsonb_build_object(
      'order_id', NEW.id,
      'table_number', NEW.table_number,
      'source', v_source,
      'total', NEW.total
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  -- A notification must never block an order
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_created ON public.orders;
CREATE TRIGGER on_order_created
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_order();

-- 3) Make sure the tables the screens listen to are published for Realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'order_items'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
  END IF;
END $$;

-- 4) Check
SELECT title, message, type, read, created_at
FROM public.notifications
WHERE type = 'order'
ORDER BY created_at DESC
LIMIT 10;
