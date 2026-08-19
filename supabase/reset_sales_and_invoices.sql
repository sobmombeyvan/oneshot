-- ONE SHOT — Remettre ventes + factures à zéro, et passer à 10 tables
-- Coller dans : Supabase Dashboard > SQL Editor > New query > Run
--
-- EFFACE :
--   factures (toutes, y compris les précédentes)
--   paiements de facture, caisse (sessions + mouvements)
--   commandes et articles de commande
--   mouvements de stock liés aux ventes
--   notifications / réservations
--
-- GARDE :
--   produits, catégories, comptes, fournisseurs, clients (points à 0)
--
-- ENSUITE :
--   20 tables (1 à 20), toutes libres
--   la prochaine facture reprend à OS26000001 (numérotation annuelle)
--
-- Pas de BEGIN/COMMIT : l'éditeur SQL Supabase tourne déjà en une transaction.

-- 1) Remettre en stock les quantités des ventes payées
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

-- 2) Détacher les clés étrangères qui bloquent les DELETE
UPDATE public.invoices SET cash_session_id = NULL WHERE cash_session_id IS NOT NULL;
UPDATE public.cash_movements SET invoice_id = NULL WHERE invoice_id IS NOT NULL;

-- 3) Ventes, caisse, factures
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
DELETE FROM public.reservations;

UPDATE public.customers SET loyalty_points = 0;

-- 4) Exactement 20 tables, toutes disponibles
DELETE FROM public.restaurant_tables WHERE number < 1 OR number > 20;

INSERT INTO public.restaurant_tables (number, status)
SELECT n, 'available'::public.table_status
FROM generate_series(1, 20) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_tables t WHERE t.number = n
);

UPDATE public.restaurant_tables SET status = 'available';

-- 5) Contrôle
SELECT 'invoices' AS table_name, COUNT(*) AS rows FROM public.invoices
UNION ALL SELECT 'orders', COUNT(*) FROM public.orders
UNION ALL SELECT 'order_items', COUNT(*) FROM public.order_items
UNION ALL SELECT 'invoice_payments', COUNT(*) FROM public.invoice_payments
UNION ALL SELECT 'cash_sessions', COUNT(*) FROM public.cash_sessions
UNION ALL SELECT 'cash_movements', COUNT(*) FROM public.cash_movements
UNION ALL SELECT 'restaurant_tables', COUNT(*) FROM public.restaurant_tables
UNION ALL SELECT 'products', COUNT(*) FROM public.products
ORDER BY 1;
