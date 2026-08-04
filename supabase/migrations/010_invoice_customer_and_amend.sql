-- Customer name on invoices + amend (add products / set name) for reprint

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS customer_name TEXT;

-- Soft-extend settle: set customer name right after payment from the app,
-- or call this helper from settle if you prefer SQL-side.
CREATE OR REPLACE FUNCTION public.set_invoice_customer_name(
  p_invoice_id UUID,
  p_customer_name TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('administrator', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'Rôle non autorisé';
  END IF;

  UPDATE public.invoices
  SET customer_name = NULLIF(trim(COALESCE(p_customer_name, '')), '')
  WHERE id = p_invoice_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_invoice_customer_name(UUID, TEXT) TO authenticated;

-- Update name and/or add products on a paid invoice (stock OUT + totals + optional cash line)
CREATE OR REPLACE FUNCTION public.amend_invoice(
  p_invoice_id UUID,
  p_customer_name TEXT DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::JSONB
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
  v_inv public.invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_item JSONB;
  v_product_id UUID;
  v_qty INTEGER;
  v_price DECIMAL(12,2);
  v_cat_type TEXT;
  v_station TEXT;
  v_added DECIMAL(12,2) := 0;
  v_new_subtotal DECIMAL(12,2);
  v_new_total DECIMAL(12,2);
  v_session_id UUID;
  v_name TEXT;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS NULL OR v_role NOT IN ('administrator', 'manager', 'cashier') THEN
    RAISE EXCEPTION 'Rôle non autorisé';
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF v_inv.id IS NULL THEN RAISE EXCEPTION 'Facture introuvable'; END IF;
  IF v_inv.status <> 'paid' THEN
    RAISE EXCEPTION 'Seules les factures payées peuvent être modifiées';
  END IF;

  v_name := CASE
    WHEN p_customer_name IS NULL THEN v_inv.customer_name
    ELSE NULLIF(trim(p_customer_name), '')
  END;

  IF v_inv.order_id IS NULL
     AND p_items IS NOT NULL
     AND jsonb_typeof(p_items) = 'array'
     AND jsonb_array_length(p_items) > 0 THEN
    RAISE EXCEPTION 'Cette facture n''a pas de commande liée';
  END IF;

  IF v_inv.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_inv.order_id FOR UPDATE;
  END IF;

  IF p_items IS NOT NULL
     AND jsonb_typeof(p_items) = 'array'
     AND jsonb_array_length(p_items) > 0 THEN
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

      v_station := CASE WHEN v_cat_type = 'lounge' THEN 'bar' ELSE 'kitchen' END;

      INSERT INTO public.order_items (order_id, product_id, quantity, price, station)
      VALUES (v_inv.order_id, v_product_id, v_qty, v_price, v_station);

      INSERT INTO public.stock_movements (product_id, type, quantity, reason, user_id)
      VALUES (
        v_product_id, 'OUT', v_qty,
        'Ajout facture #' || v_inv.invoice_number,
        v_uid
      );

      v_added := v_added + (v_price * v_qty);
    END LOOP;

    v_new_subtotal := COALESCE(v_order.subtotal, 0) + v_added;
    v_new_total := v_new_subtotal - COALESCE(v_order.discount, 0) + COALESCE(v_order.tax, 0);

    UPDATE public.orders
    SET subtotal = v_new_subtotal,
        total = v_new_total,
        updated_at = NOW()
    WHERE id = v_inv.order_id;

    UPDATE public.invoices
    SET subtotal = v_new_subtotal,
        total = v_new_total,
        customer_name = v_name,
        payment_method = CASE
          WHEN v_inv.payment_method = 'cash' THEN 'cash'::public.payment_method
          ELSE 'mixed'::public.payment_method
        END
    WHERE id = v_inv.id;

    IF v_added > 0 THEN
      INSERT INTO public.invoice_payments (invoice_id, method, amount)
      VALUES (v_inv.id, 'cash'::public.payment_method, v_added);

      SELECT id INTO v_session_id
      FROM public.cash_sessions
      WHERE cashier_id = v_uid AND status = 'open'
      LIMIT 1;

      IF v_session_id IS NOT NULL THEN
        INSERT INTO public.cash_movements (session_id, type, amount, reason, invoice_id, created_by)
        VALUES (
          v_session_id, 'cash_sale', v_added,
          'Ajout articles #' || v_inv.invoice_number,
          v_inv.id, v_uid
        );
        PERFORM public.recalc_session_expected(v_session_id);
      END IF;
    END IF;
  ELSE
    UPDATE public.invoices
    SET customer_name = v_name
    WHERE id = v_inv.id;
  END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;

  RETURN json_build_object(
    'ok', true,
    'invoice_id', v_inv.id,
    'invoice_number', v_inv.invoice_number,
    'customer_name', v_inv.customer_name,
    'subtotal', v_inv.subtotal,
    'total', v_inv.total,
    'added_amount', v_added
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.amend_invoice(UUID, TEXT, JSONB) TO authenticated;
