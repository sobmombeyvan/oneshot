-- ONE SHOT — Passer à 20 tables (1 à 20), toutes disponibles
-- Supabase Dashboard > SQL Editor > Run

DELETE FROM public.restaurant_tables WHERE number < 1 OR number > 20;

INSERT INTO public.restaurant_tables (number, status)
SELECT n, 'available'::public.table_status
FROM generate_series(1, 20) AS n
WHERE NOT EXISTS (
  SELECT 1 FROM public.restaurant_tables t WHERE t.number = n
);

UPDATE public.restaurant_tables SET status = 'available';

SELECT number, status
FROM public.restaurant_tables
ORDER BY number;
