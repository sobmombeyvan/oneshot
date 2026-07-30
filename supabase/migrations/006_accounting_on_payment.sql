-- Accounting: revenue only from paid invoices (validated payment).
-- Pending / cancelled orders must not inflate the dashboard.

CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'today_revenue', COALESCE((
      SELECT SUM(total) FROM public.invoices
      WHERE status = 'paid' AND created_at::DATE = CURRENT_DATE
    ), 0),
    'monthly_revenue', COALESCE((
      SELECT SUM(total) FROM public.invoices
      WHERE status = 'paid'
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
    ), 0),
    'inventory_value', COALESCE((
      SELECT SUM(stock * purchase_price) FROM public.products WHERE status = 'active'
    ), 0),
    'pending_orders', (
      SELECT COUNT(*) FROM public.orders
      WHERE status IN ('pending', 'preparing', 'ready', 'served')
        AND payment_method IS NULL
    ),
    'low_stock_count', (
      SELECT COUNT(*) FROM public.products
      WHERE stock <= minimum_stock AND status = 'active'
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
