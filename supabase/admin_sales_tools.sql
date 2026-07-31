-- ONE SHOT — Admin sales tools (run once in Supabase SQL Editor)
-- Same content as migrations/008_admin_sales_tools.sql

CREATE OR REPLACE FUNCTION public.admin_assert_password(p_password TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_role public.user_role;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Non authentifié';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid;
  IF v_role IS DISTINCT FROM 'administrator' THEN
    RAISE EXCEPTION 'Réservé à l''administrateur';
  END IF;

  IF coalesce(trim(p_password), '') <> '11310' THEN
    RAISE EXCEPTION 'Mot de passe administrateur incorrect';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reset_all_sales(p_password TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_orders INT;
  v_invoices INT;
BEGIN
  PERFORM public.admin_assert_password(p_password);

  UPDATE public.products p
  SET stock = p.stock + sub.qty,
      updated_at = NOW()
  FROM (
    SELECT oi.product_id, SUM(oi.quantity)::INT AS qty
    FROM public.order_items oi
    JOIN public.orders o ON o.id = oi.order_id
    WHERE o.status = 'completed'
      AND o.payment_method IS NOT NULL
    GROUP BY oi.product_id
  ) sub
  WHERE p.id = sub.product_id;

  SELECT COUNT(*) INTO v_invoices FROM public.invoices;
  SELECT COUNT(*) INTO v_orders FROM public.orders;

  UPDATE public.invoices SET cash_session_id = NULL WHERE cash_session_id IS NOT NULL;
  UPDATE public.cash_movements SET invoice_id = NULL WHERE invoice_id IS NOT NULL;

  DELETE FROM public.invoice_payments;
  DELETE FROM public.cash_movements;
  DELETE FROM public.cash_sessions;
  DELETE FROM public.invoices;
  DELETE FROM public.order_items;
  DELETE FROM public.orders;
  DELETE FROM public.stock_movements
    WHERE reason ILIKE 'Paiement validé%'
       OR reason ILIKE 'Paiement valide%';
  DELETE FROM public.notifications;

  UPDATE public.restaurant_tables SET status = 'available';
  UPDATE public.customers SET loyalty_points = 0;

  RETURN json_build_object(
    'ok', true,
    'deleted_orders', v_orders,
    'deleted_invoices', v_invoices
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_delete_transaction(
  p_password TEXT,
  p_invoice_number TEXT
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inv public.invoices%ROWTYPE;
  v_item RECORD;
  v_session_id UUID;
BEGIN
  PERFORM public.admin_assert_password(p_password);

  IF coalesce(trim(p_invoice_number), '') = '' THEN
    RAISE EXCEPTION 'Numéro de facture requis';
  END IF;

  SELECT * INTO v_inv
  FROM public.invoices
  WHERE invoice_number = trim(p_invoice_number);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Facture introuvable: %', p_invoice_number;
  END IF;

  v_session_id := v_inv.cash_session_id;

  IF v_inv.order_id IS NOT NULL THEN
    FOR v_item IN
      SELECT product_id, quantity
      FROM public.order_items
      WHERE order_id = v_inv.order_id
    LOOP
      UPDATE public.products
      SET stock = stock + v_item.quantity, updated_at = NOW()
      WHERE id = v_item.product_id;

      DELETE FROM public.stock_movements
      WHERE product_id = v_item.product_id
        AND type = 'OUT'
        AND reason ILIKE '%' || left(v_inv.order_id::text, 8) || '%';
    END LOOP;
  END IF;

  DELETE FROM public.cash_movements WHERE invoice_id = v_inv.id;
  UPDATE public.invoices SET cash_session_id = NULL WHERE id = v_inv.id;

  DELETE FROM public.invoice_payments WHERE invoice_id = v_inv.id;
  DELETE FROM public.invoices WHERE id = v_inv.id;

  IF v_inv.order_id IS NOT NULL THEN
    DELETE FROM public.order_items WHERE order_id = v_inv.order_id;
    DELETE FROM public.orders WHERE id = v_inv.order_id;
  END IF;

  IF v_session_id IS NOT NULL THEN
    PERFORM public.recalc_session_expected(v_session_id);
  END IF;

  RETURN json_build_object(
    'ok', true,
    'invoice_number', v_inv.invoice_number,
    'order_id', v_inv.order_id,
    'total', v_inv.total
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_assert_password(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_sales(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_transaction(TEXT, TEXT) TO authenticated;
