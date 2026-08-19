-- ONE SHOT — Categories and menu products
-- Run after reset_sales_and_products.sql.
-- Safe to run again: products are updated using their unique barcode.
--
-- No BEGIN/COMMIT here: the Supabase SQL Editor already runs the whole script
-- in a single transaction and rejects explicit transaction control.

-- Food categories use "grill"; drinks use "lounge".
INSERT INTO public.categories (name, type)
SELECT v.name, v.type::category_type
FROM (VALUES
  ('Burgers & Sandwichs', 'grill'),
  ('Poulet',              'grill'),
  ('Grillades',           'grill'),
  ('Mayonnaise',          'grill'),
  ('Poissons',            'grill'),
  ('Accompagnements',     'grill'),
  ('Menu spécial',        'grill'),
  ('Boissons',            'lounge')
) AS v(name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE LOWER(c.name) = LOWER(v.name)
);

INSERT INTO public.products (
  name,
  description,
  barcode,
  purchase_price,
  selling_price,
  stock,
  minimum_stock,
  category_id,
  status
)
SELECT
  v.name,
  v.description,
  v.barcode,
  0,
  v.price,
  100,
  5,
  (
    SELECT c.id
    FROM public.categories c
    WHERE LOWER(c.name) = LOWER(v.category)
    ORDER BY c.created_at
    LIMIT 1
  ),
  'active'::product_status
FROM (VALUES
  -- Burgers & sandwichs
  ('Burger Classique',              NULL::text, 'OS-BUR-001',  2500::decimal, 'Burgers & Sandwichs'),
  ('Cheeseburger',                        NULL, 'OS-BUR-002',  3000::decimal, 'Burgers & Sandwichs'),
  ('Double Burger',                       NULL, 'OS-BUR-003',  4500::decimal, 'Burgers & Sandwichs'),
  ('Burger Poulet Pané',                  NULL, 'OS-BUR-004',  4000::decimal, 'Burgers & Sandwichs'),
  ('Burger Steak Grillé',                 NULL, 'OS-BUR-005',  4000::decimal, 'Burgers & Sandwichs'),
  ('Burger Bacon & Fromage',              NULL, 'OS-BUR-006',  4500::decimal, 'Burgers & Sandwichs'),
  ('Sandwich Poulet Grillé',              NULL, 'OS-BUR-007',  2500::decimal, 'Burgers & Sandwichs'),
  ('Hot Dog',                             NULL, 'OS-BUR-008',  2000::decimal, 'Burgers & Sandwichs'),

  -- Poulet
  ('Poulet braisé (1/4)',                 NULL, 'OS-POU-001',  2000::decimal, 'Poulet'),
  ('Poulet braisé (1/2)',                 NULL, 'OS-POU-002',  4500::decimal, 'Poulet'),
  ('Poulet braisé (entier)',              NULL, 'OS-POU-003',  8500::decimal, 'Poulet'),
  ('Poulet grillé aux herbes (1/2)',      NULL, 'OS-POU-004',  5000::decimal, 'Poulet'),
  ('Ailes de poulet BBQ (6 pièces)',      NULL, 'OS-POU-005',  4000::decimal, 'Poulet'),
  ('Wings panés (6 pièces)',              NULL, 'OS-POU-006',  3500::decimal, 'Poulet'),
  ('Brochettes de poulet (5 brochettes)', NULL, 'OS-POU-007',  4000::decimal, 'Poulet'),

  -- Grillades
  ('Brochettes de bœuf (5 brochettes)',   NULL, 'OS-GRI-001',  5000::decimal, 'Grillades'),
  ('Brochettes de porc (5 brochettes)',   NULL, 'OS-GRI-002',  4500::decimal, 'Grillades'),
  ('Côtes de porc grillées',              NULL, 'OS-GRI-003',  4500::decimal, 'Grillades'),
  ('Saucisses grillées (2)',              NULL, 'OS-GRI-004',  2000::decimal, 'Grillades'),
  ('Mix Grill (assortiment de viandes)',  NULL, 'OS-GRI-005', 15000::decimal, 'Grillades'),

  -- Mayonnaise
  ('Poulet mayo (1/4)',                   NULL, 'OS-MAY-001',  2500::decimal, 'Mayonnaise'),
  ('Poulet mayo (1/2)',                   NULL, 'OS-MAY-002',  4500::decimal, 'Mayonnaise'),
  ('Porc mayo',                           NULL, 'OS-MAY-003',  3000::decimal, 'Mayonnaise'),

  -- Poissons
  ('Tilapia braisé',                      NULL, 'OS-POI-001',  4000::decimal, 'Poissons'),
  ('Bar grillé',                          NULL, 'OS-POI-002',  6500::decimal, 'Poissons'),
  ('Silure (petit)',       'Petit format', 'OS-POI-003',  3000::decimal, 'Poissons'),
  ('Silure (moyen)',       'Format moyen', 'OS-POI-004',  6500::decimal, 'Poissons'),
  ('Silure (grand)',       'Grand format', 'OS-POI-005', 10000::decimal, 'Poissons'),
  ('Crevettes grillées',                  NULL, 'OS-POI-006',  6000::decimal, 'Poissons'),
  ('Gambas',                              NULL, 'OS-POI-007',  8000::decimal, 'Poissons'),

  -- Accompagnements
  ('Petite portion de frites',            NULL, 'OS-ACC-001',   500::decimal, 'Accompagnements'),
  ('Grande portion de frites',            NULL, 'OS-ACC-002',  1000::decimal, 'Accompagnements'),
  ('Plantain frit (petite portion)',      NULL, 'OS-ACC-003',   500::decimal, 'Accompagnements'),
  ('Plantain frit (grande portion)',      NULL, 'OS-ACC-004',  1000::decimal, 'Accompagnements'),
  ('Riz blanc',                           NULL, 'OS-ACC-005',   500::decimal, 'Accompagnements'),
  ('Riz One Shot',                        NULL, 'OS-ACC-006',  1500::decimal, 'Accompagnements'),

  -- Menu spécial
  ('Combo One Shot Spéciale',
   'Requin + frites + plantain + porc',         'OS-SPE-001', 80000::decimal, 'Menu spécial'),

  -- Boissons
  ('Jus d''Ananas',                       NULL, 'OS-BOI-001',  1500::decimal, 'Boissons'),
  ('Jus Ananas Gingembre',                NULL, 'OS-BOI-002',  1500::decimal, 'Boissons'),
  ('Jus Ananas Passion',                  NULL, 'OS-BOI-003',  1500::decimal, 'Boissons'),
  ('Jus de Corossol',                     NULL, 'OS-BOI-004',  2000::decimal, 'Boissons'),
  ('Jus Mangue Citron',                   NULL, 'OS-BOI-005',  1500::decimal, 'Boissons'),
  ('Eau Supermont',                       NULL, 'OS-BOI-006',   500::decimal, 'Boissons'),
  ('Jus de Bissap',                       NULL, 'OS-BOI-007',  1000::decimal, 'Boissons')
) AS v(name, description, barcode, price, category)
ON CONFLICT (barcode) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  selling_price = EXCLUDED.selling_price,
  category_id = EXCLUDED.category_id,
  status = 'active'::product_status,
  updated_at = NOW();

-- Drop leftover empty demo categories (seed Cocktails, Beer, etc.)
DELETE FROM public.categories c
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p WHERE p.category_id = c.id
);

-- Verification: expected total from this script = 44 products.
SELECT
  c.name AS category,
  COUNT(p.id) AS products
FROM public.categories c
LEFT JOIN public.products p ON p.category_id = c.id
WHERE c.name IN (
  'Burgers & Sandwichs', 'Poulet', 'Grillades', 'Mayonnaise',
  'Poissons', 'Accompagnements', 'Menu spécial', 'Boissons'
)
GROUP BY c.name
ORDER BY c.name;
