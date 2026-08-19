-- ONE SHOT — Reset sales + products (keep users, categories, tables)
-- Paste this into: Supabase Dashboard > SQL Editor > New query > Run
--
-- To reset SALES and INVOICES only (keep products) and set 10 tables,
-- use instead: reset_sales_and_invoices.sql
--
-- CLEARS:
--   invoices, orders, order items
--   purchases, purchase items
--   stock movements
--   products
--   notifications
--   reservations
--   customer loyalty (customers kept, points zeroed)
--
-- KEEPS:
--   profiles / login accounts
--   categories
--   restaurant_tables (set back to available)
--   suppliers
--
-- No BEGIN/COMMIT here: the Supabase SQL Editor already runs the whole script
-- in a single transaction and rejects explicit transaction control.

-- Sales / billing (children first when no CASCADE)
DELETE FROM public.invoices;
DELETE FROM public.order_items;
DELETE FROM public.orders;

-- Purchases / stock history
DELETE FROM public.purchase_items;
DELETE FROM public.purchases;
DELETE FROM public.stock_movements;

-- Products (you will re-add them in the app)
DELETE FROM public.products;

-- Noise
DELETE FROM public.notifications;
DELETE FROM public.reservations;

-- Soft resets
UPDATE public.customers SET loyalty_points = 0;
UPDATE public.restaurant_tables SET status = 'available';

-- Quick check
SELECT 'invoices' AS table_name, COUNT(*) AS rows FROM public.invoices
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'order_items', COUNT(*) FROM public.order_items
UNION ALL SELECT 'products', COUNT(*) FROM public.products
UNION ALL SELECT 'purchases', COUNT(*) FROM public.purchases
UNION ALL SELECT 'stock_movements', COUNT(*) FROM public.stock_movements
UNION ALL SELECT 'categories', COUNT(*) FROM public.categories
UNION ALL SELECT 'profiles', COUNT(*) FROM public.profiles;
