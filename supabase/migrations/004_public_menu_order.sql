-- Public guest menu: anyone can read the menu and place an order (no login).
-- Run in Supabase SQL Editor after 001_initial_schema.sql

-- 1) Public read of the menu + tables
DROP POLICY IF EXISTS "Public read categories" ON public.categories;
CREATE POLICY "Public read categories"
  ON public.categories
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "Public read active products" ON public.products;
CREATE POLICY "Public read active products"
  ON public.products
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "Public read tables" ON public.restaurant_tables;
CREATE POLICY "Public read tables"
  ON public.restaurant_tables
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- 2) Guest order RPC — prices come from the DB, never from the client
CREATE OR REPLACE FUNCTION public.place_guest_order(
  p_table_number INTEGER,
  p_items JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id UUID;
  v_table_id UUID;
  v_subtotal NUMERIC(12,2) := 0;
  v_item JSONB;
  v_product_id UUID;
  v_qty INTEGER;
  v_price NUMERIC(12,2);
  v_station TEXT;
  v_cat_type TEXT;
  v_count INTEGER := 0;
BEGIN
  IF p_table_number IS NULL OR p_table_number < 1 THEN
    RAISE EXCEPTION 'Numéro de table invalide';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Panier vide';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Trop d''articles';
  END IF;

  SELECT id INTO v_table_id
  FROM public.restaurant_tables
  WHERE number = p_table_number
  LIMIT 1;

  -- Validate items and sum from DB prices
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_qty := COALESCE((v_item ->> 'quantity')::INTEGER, 0);

    IF v_qty < 1 OR v_qty > 99 THEN
      RAISE EXCEPTION 'Quantité invalide';
    END IF;

    SELECT p.selling_price, c.type
    INTO v_price, v_cat_type
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE p.id = v_product_id AND p.status = 'active';

    IF v_price IS NULL THEN
      RAISE EXCEPTION 'Produit indisponible';
    END IF;

    v_subtotal := v_subtotal + (v_price * v_qty);
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Panier vide';
  END IF;

  INSERT INTO public.orders (
    table_number,
    table_id,
    cashier_id,
    status,
    payment_method,
    subtotal,
    discount,
    tax,
    total,
    notes
  ) VALUES (
    p_table_number,
    v_table_id,
    NULL,
    'pending',
    NULL,
    v_subtotal,
    0,
    0,
    v_subtotal,
    'Commande menu public — table ' || p_table_number::TEXT
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := (v_item ->> 'product_id')::UUID;
    v_qty := (v_item ->> 'quantity')::INTEGER;

    SELECT p.selling_price, c.type
    INTO v_price, v_cat_type
    FROM public.products p
    LEFT JOIN public.categories c ON c.id = p.category_id
    WHERE p.id = v_product_id AND p.status = 'active';

    v_station := CASE WHEN v_cat_type = 'lounge' THEN 'bar' ELSE 'grill' END;

    INSERT INTO public.order_items (order_id, product_id, quantity, price, station)
    VALUES (v_order_id, v_product_id, v_qty, v_price, v_station);
  END LOOP;

  IF v_table_id IS NOT NULL THEN
    UPDATE public.restaurant_tables
    SET status = 'occupied'
    WHERE id = v_table_id;
  END IF;

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.place_guest_order(INTEGER, JSONB) TO anon, authenticated;
