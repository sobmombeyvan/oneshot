-- ONE SHOT — Synchroniser la carte lounge (prix, doublons, manquants)
-- Supabase Dashboard > SQL Editor > Run (réutilisable)
--
-- Fusionne les anciennes entrées (Whiskey, OS-CHA-*, noms sans catégorie)
-- avec la carte officielle ci-dessous.
-- Ne réassigne JAMAIS un barcode déjà pris → désactive les doublons à la place.

-- ── 1) Catégories ─────────────────────────────────────────────────────────
INSERT INTO public.categories (name, type)
SELECT v.name, v.type::category_type
FROM (VALUES
  ('Champagnes',                    'lounge'),
  ('Whisky & Bourbon',              'lounge'),
  ('Cognac & Prestige',             'lounge'),
  ('Vodka',                         'lounge'),
  ('Autres Spiritueux & Liqueurs',  'lounge'),
  ('Bières',                        'lounge'),
  ('Vins & Autres',                 'lounge'),
  ('Boissons gazeuses',             'lounge')
) AS v(name, type)
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE LOWER(c.name) = LOWER(v.name)
);

UPDATE public.categories SET name = 'Whisky & Bourbon'
WHERE name IN ('Whiskey', 'Whisky');

UPDATE public.categories SET name = 'Autres Spiritueux & Liqueurs'
WHERE name = 'Autres Spiritueux';

UPDATE public.products p
SET category_id = w.id, updated_at = NOW()
FROM public.categories old_c, public.categories w
WHERE p.category_id = old_c.id
  AND old_c.name IN ('Whiskey', 'Whisky')
  AND w.name = 'Whisky & Bourbon';

UPDATE public.products p
SET category_id = n.id, updated_at = NOW()
FROM public.categories old_c, public.categories n
WHERE p.category_id = old_c.id
  AND old_c.name = 'Autres Spiritueux'
  AND n.name = 'Autres Spiritueux & Liqueurs';

-- ── 2) Catalogue officiel (upsert par code-barres) ────────────────────────
INSERT INTO public.products (
  name, description, barcode, purchase_price, selling_price,
  stock, minimum_stock, category_id, status
)
SELECT
  v.name, v.description, v.barcode, 0, v.price, 100, 5,
  (SELECT c.id FROM public.categories c WHERE LOWER(c.name) = LOWER(v.category) ORDER BY c.created_at LIMIT 1),
  'active'::product_status
FROM (VALUES
  ('Fruites',                 NULL::text, 'OS-SFT-001',   5000::decimal, 'Boissons gazeuses'),
  ('Tonic',                   NULL,       'OS-SFT-002',   1000::decimal, 'Boissons gazeuses'),
  ('Sprite',                  NULL,       'OS-SFT-003',   1000::decimal, 'Boissons gazeuses'),
  ('Red Bull',                NULL,       'OS-SFT-004',   2000::decimal, 'Boissons gazeuses'),
  ('Coca-Cola',               NULL,       'OS-SFT-005',   1000::decimal, 'Boissons gazeuses'),
  ('Schweppes',               NULL,       'OS-SFT-006',   1000::decimal, 'Boissons gazeuses'),
  ('Eau plate – petite',      NULL,       'OS-SFT-007',   1500::decimal, 'Boissons gazeuses'),
  ('Eau pétillante – petite', NULL,       'OS-SFT-008',   2000::decimal, 'Boissons gazeuses'),
  ('Eau plate – grande',      NULL,       'OS-SFT-009',   3500::decimal, 'Boissons gazeuses'),
  ('Eau pétillante – grande', NULL,       'OS-SFT-010',   3500::decimal, 'Boissons gazeuses'),

  ('Armand de Brignac',        NULL, 'OS-CHP-001', 500000::decimal, 'Champagnes'),
  ('Cristal',                  NULL, 'OS-CHP-002', 300000::decimal, 'Champagnes'),
  ('Dom Pérignon Rosé',        NULL, 'OS-CHP-003', 300000::decimal, 'Champagnes'),
  ('Dom Pérignon Brut',        NULL, 'OS-CHP-004', 250000::decimal, 'Champagnes'),
  ('Veuve Rich',               NULL, 'OS-CHP-005', 120000::decimal, 'Champagnes'),
  ('Ruinart Blanc des Blancs', NULL, 'OS-CHP-006', 120000::decimal, 'Champagnes'),
  ('Moët Nectar',              NULL, 'OS-CHP-007', 100000::decimal, 'Champagnes'),
  ('Ruinart Brut',             NULL, 'OS-CHP-008',  95000::decimal, 'Champagnes'),
  ('Veuve Clicquot Brut',      NULL, 'OS-CHP-009',  90000::decimal, 'Champagnes'),
  ('Laurent Perrier Brut',     NULL, 'OS-CHP-010',  70000::decimal, 'Champagnes'),
  ('Moët Brut',                NULL, 'OS-CHP-011',  70000::decimal, 'Champagnes'),

  ('Chivas 18 ans',         NULL, 'OS-WHB-001', 130000::decimal, 'Whisky & Bourbon'),
  ('Glenfiddich 18 ans',    NULL, 'OS-WHB-002', 120000::decimal, 'Whisky & Bourbon'),
  ('Gold Label',            NULL, 'OS-WHB-003', 110000::decimal, 'Whisky & Bourbon'),
  ('Platinum Label',        NULL, 'OS-WHB-004', 110000::decimal, 'Whisky & Bourbon'),
  ('Martell 18 ans',        NULL, 'OS-WHB-014', 100000::decimal, 'Whisky & Bourbon'),
  ('Glenfiddich 12 ans',    NULL, 'OS-WHB-005',  80000::decimal, 'Whisky & Bourbon'),
  ('Chivas 15 ans',         NULL, 'OS-WHB-006',  80000::decimal, 'Whisky & Bourbon'),
  ('Double Black',          NULL, 'OS-WHB-007',  80000::decimal, 'Whisky & Bourbon'),
  ('Monkey Shoulder',       NULL, 'OS-WHB-008',  60000::decimal, 'Whisky & Bourbon'),
  ('Chivas 12 ans',         NULL, 'OS-WHB-009',  55000::decimal, 'Whisky & Bourbon'),
  ('Jack Daniel''s 1L',     NULL, 'OS-WHB-010',  55000::decimal, 'Whisky & Bourbon'),
  ('Jack Daniel''s Honey',  NULL, 'OS-WHB-011',  45000::decimal, 'Whisky & Bourbon'),
  ('Ballantine 12 ans',     NULL, 'OS-WHB-012',  45000::decimal, 'Whisky & Bourbon'),
  ('Ballantine 15',         NULL, 'OS-WHB-013',  35000::decimal, 'Whisky & Bourbon'),

  ('Clase Azul',      NULL, 'OS-COG-001', 500000::decimal, 'Cognac & Prestige'),
  ('Hennessy XO',     NULL, 'OS-COG-002', 260000::decimal, 'Cognac & Prestige'),
  ('Martell 18 ans',  NULL, 'OS-COG-003', 100000::decimal, 'Cognac & Prestige'),
  ('Martell 12 ans',  NULL, 'OS-COG-004',  55000::decimal, 'Cognac & Prestige'),

  ('Magnum Belvédère', NULL, 'OS-VOD-001', 150000::decimal, 'Vodka'),
  ('Belvedere 75 cl',  NULL, 'OS-VOD-002',  75000::decimal, 'Vodka'),
  ('Absolut fruitée',  NULL, 'OS-VOD-003',  45000::decimal, 'Vodka'),
  ('Absolut 1L',       NULL, 'OS-VOD-004',  40000::decimal, 'Vodka'),

  ('Baileys',  'Bouteille', 'OS-SPI-001', 30000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Baileys',  'Verre',     'OS-SPI-002', 20000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Martini',  'Bouteille', 'OS-SPI-003', 30000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Martini',  'Verre',     'OS-SPI-004', 20000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Moscato',  NULL,        'OS-SPI-005',  30000::decimal, 'Autres Spiritueux & Liqueurs'),

  ('Moscato', NULL, 'OS-VIN-001', 30000::decimal, 'Vins & Autres'),
  ('Martini', NULL, 'OS-VIN-002', 30000::decimal, 'Vins & Autres'),
  ('Baileys', NULL, 'OS-VIN-003', 30000::decimal, 'Vins & Autres'),

  ('Pack bière (20 bières)', NULL, 'OS-BIE-001', 50000::decimal, 'Bières')
) AS v(name, description, barcode, price, category)
ON CONFLICT (barcode) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  selling_price = EXCLUDED.selling_price,
  category_id = EXCLUDED.category_id,
  status = 'active'::product_status,
  updated_at = NOW();

-- ── 3) Désactiver les anciennes entrées (le canon garde le barcode) ────────
UPDATE public.products p
SET status = 'discontinued'::product_status, updated_at = NOW()
WHERE p.status = 'active'
  AND p.barcode IS NULL
  AND (
    (LOWER(TRIM(p.name)) IN ('redbull', 'red bull')
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-SFT-004' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('coca cola', 'coca-cola')
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-SFT-005' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('eau supermont plate', 'bouteille d''eau', 'eau supermont')
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-SFT-007' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) = 'eau supermont grand format'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-SFT-009' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) = 'sprite'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-SFT-003' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('moet nectar', 'moët nectar')
      AND p.barcode IS DISTINCT FROM 'OS-CHP-007'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-CHP-007' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('moet & chandon impérial', 'moet & chandon imperial')
      AND p.barcode IS DISTINCT FROM 'OS-CHP-011'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-CHP-011' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('ruinart blanc de blancs', 'ruinart blanc des blancs')
      AND p.barcode IS DISTINCT FROM 'OS-CHP-006'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-CHP-006' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) = 'azul'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-COG-001' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('hennessy xo', 'hennessy xo cognac')
      AND p.barcode IS DISTINCT FROM 'OS-COG-002'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-COG-002' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) = 'magnum'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-VOD-001' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('vodka belvedere (75 cl)', 'vodka belvédère 70cl')
      AND p.barcode IS DISTINCT FROM 'OS-VOD-002'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-VOD-002' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('absolut vodka 1l', 'absolut 1l')
      AND p.barcode IS DISTINCT FROM 'OS-VOD-004'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-VOD-004' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('absolut vodka 75cl', 'absolut fruitée', 'absolut raspberry', 'absolut vanille')
      AND p.barcode IS DISTINCT FROM 'OS-VOD-003'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-VOD-003' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('bailey''s', 'baileys')
      AND p.selling_price = 30000
      AND p.barcode IS DISTINCT FROM 'OS-SPI-001'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-SPI-001' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) LIKE '%moscato%'
      AND p.barcode NOT IN ('OS-VIN-001', 'OS-SPI-005')
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode IN ('OS-VIN-001', 'OS-SPI-005') AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) = 'jack daniel (petit)'
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-WHB-011' AND c.id <> p.id))
    OR (LOWER(TRIM(p.name)) IN ('ballantine finest', 'ballantine brasil')
      AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-WHB-013' AND c.id <> p.id))
  );

-- OS-CHA-* : désactiver si OS-CHP-* existe déjà, sinon migrer le barcode
UPDATE public.products old_p
SET status = 'discontinued'::product_status, updated_at = NOW()
FROM (VALUES
  ('OS-CHA-010', 'OS-CHP-001'), ('OS-CHA-009', 'OS-CHP-002'), ('OS-CHA-008', 'OS-CHP-003'),
  ('OS-CHA-007', 'OS-CHP-004'), ('OS-CHA-005', 'OS-CHP-005'), ('OS-CHA-006', 'OS-CHP-006'),
  ('OS-CHA-002', 'OS-CHP-007'), ('OS-CHA-004', 'OS-CHP-008'), ('OS-CHA-003', 'OS-CHP-009'),
  ('OS-CHA-001', 'OS-CHP-010'), ('OS-CHA-012', 'OS-CHP-011')
) AS m(old_bc, new_bc)
WHERE old_p.barcode = m.old_bc
  AND EXISTS (SELECT 1 FROM public.products n WHERE n.barcode = m.new_bc);

UPDATE public.products old_p
SET barcode = m.new_bc, name = m.new_name, selling_price = m.price,
  category_id = (SELECT id FROM public.categories WHERE name = 'Champagnes' LIMIT 1),
  status = 'active', updated_at = NOW()
FROM (VALUES
  ('OS-CHA-010', 'OS-CHP-001', 'Armand de Brignac', 500000),
  ('OS-CHA-009', 'OS-CHP-002', 'Cristal', 300000),
  ('OS-CHA-008', 'OS-CHP-003', 'Dom Pérignon Rosé', 300000),
  ('OS-CHA-007', 'OS-CHP-004', 'Dom Pérignon Brut', 250000),
  ('OS-CHA-005', 'OS-CHP-005', 'Veuve Rich', 120000),
  ('OS-CHA-006', 'OS-CHP-006', 'Ruinart Blanc des Blancs', 120000),
  ('OS-CHA-002', 'OS-CHP-007', 'Moët Nectar', 100000),
  ('OS-CHA-004', 'OS-CHP-008', 'Ruinart Brut', 95000),
  ('OS-CHA-003', 'OS-CHP-009', 'Veuve Clicquot Brut', 90000),
  ('OS-CHA-001', 'OS-CHP-010', 'Laurent Perrier Brut', 70000),
  ('OS-CHA-012', 'OS-CHP-011', 'Moët Brut', 70000)
) AS m(old_bc, new_bc, new_name, price)
WHERE old_p.barcode = m.old_bc
  AND NOT EXISTS (SELECT 1 FROM public.products n WHERE n.barcode = m.new_bc);

-- OS-WHI-* : idem
UPDATE public.products old_p
SET status = 'discontinued'::product_status, updated_at = NOW()
FROM (VALUES
  ('OS-WHI-009', 'OS-WHB-001'), ('OS-WHI-013', 'OS-WHB-002'), ('OS-WHI-017', 'OS-WHB-003'),
  ('OS-WHI-018', 'OS-WHB-004'), ('OS-WHI-011', 'OS-WHB-005'), ('OS-WHI-033', 'OS-WHB-006'),
  ('OS-WHI-021', 'OS-WHB-007'), ('OS-WHI-015', 'OS-WHB-008'), ('OS-WHI-008', 'OS-WHB-009'),
  ('OS-WHI-003', 'OS-WHB-010'), ('OS-WHI-002', 'OS-WHB-011'), ('OS-WHI-030', 'OS-WHB-012')
) AS m(old_bc, new_bc)
WHERE old_p.barcode = m.old_bc
  AND EXISTS (SELECT 1 FROM public.products n WHERE n.barcode = m.new_bc);

UPDATE public.products old_p
SET barcode = m.new_bc, selling_price = m.price,
  category_id = (SELECT id FROM public.categories WHERE name = 'Whisky & Bourbon' LIMIT 1),
  status = 'active', updated_at = NOW()
FROM (VALUES
  ('OS-WHI-009', 'OS-WHB-001', 130000), ('OS-WHI-013', 'OS-WHB-002', 120000),
  ('OS-WHI-017', 'OS-WHB-003', 110000), ('OS-WHI-018', 'OS-WHB-004', 110000),
  ('OS-WHI-011', 'OS-WHB-005', 80000),  ('OS-WHI-033', 'OS-WHB-006', 80000),
  ('OS-WHI-021', 'OS-WHB-007', 80000),  ('OS-WHI-015', 'OS-WHB-008', 60000),
  ('OS-WHI-008', 'OS-WHB-009', 55000),  ('OS-WHI-003', 'OS-WHB-010', 55000),
  ('OS-WHI-002', 'OS-WHB-011', 45000),  ('OS-WHI-030', 'OS-WHB-012', 45000)
) AS m(old_bc, new_bc, price)
WHERE old_p.barcode = m.old_bc
  AND NOT EXISTS (SELECT 1 FROM public.products n WHERE n.barcode = m.new_bc);

-- Martell 12 / Hennessy XO / Azul champagne
UPDATE public.products p SET status = 'discontinued'::product_status, updated_at = NOW()
WHERE LOWER(TRIM(p.name)) LIKE '%martell 12%'
  AND p.barcode IS DISTINCT FROM 'OS-COG-004'
  AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-COG-004');

UPDATE public.products p
SET category_id = (SELECT id FROM public.categories WHERE name = 'Cognac & Prestige' LIMIT 1),
  selling_price = 55000, barcode = 'OS-COG-004', status = 'active', updated_at = NOW()
WHERE LOWER(TRIM(p.name)) LIKE '%martell 12%'
  AND p.barcode IS DISTINCT FROM 'OS-WHB-014'
  AND NOT EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-COG-004');

UPDATE public.products p SET status = 'discontinued'::product_status, updated_at = NOW()
WHERE LOWER(TRIM(p.name)) IN ('hennessy xo', 'hennessy xo cognac')
  AND p.barcode IS DISTINCT FROM 'OS-COG-002'
  AND EXISTS (SELECT 1 FROM public.products c WHERE c.barcode = 'OS-COG-002');

UPDATE public.products p SET status = 'discontinued'::product_status, updated_at = NOW()
WHERE LOWER(TRIM(p.name)) = 'azul'
  AND category_id = (SELECT id FROM public.categories WHERE name = 'Champagnes' LIMIT 1);

-- ── 4) Doublons restants (même catégorie + nom + prix) ────────────────────
WITH ranked AS (
  SELECT p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.category_id, LOWER(TRIM(p.name)), COALESCE(p.description, ''), p.selling_price
      ORDER BY CASE WHEN p.barcode IS NOT NULL THEN 0 ELSE 1 END, p.created_at
    ) AS rn
  FROM public.products p
  WHERE p.status = 'active'
)
UPDATE public.products
SET status = 'discontinued'::product_status, updated_at = NOW()
WHERE id IN (
  SELECT r.id FROM ranked r
  WHERE r.rn > 1
    AND EXISTS (
      SELECT 1 FROM public.products p2
      WHERE p2.status = 'active' AND p2.id <> r.id
        AND p2.category_id = (SELECT category_id FROM public.products WHERE id = r.id)
        AND LOWER(TRIM(p2.name)) = (SELECT LOWER(TRIM(name)) FROM public.products WHERE id = r.id)
        AND p2.barcode IS NOT NULL
    )
);

-- ── 5) Contrôle ───────────────────────────────────────────────────────────
SELECT c.name AS categorie, p.name, p.description, p.selling_price, p.barcode, p.status
FROM public.products p
LEFT JOIN public.categories c ON c.id = p.category_id
WHERE p.status = 'active'
  AND (
    p.barcode LIKE 'OS-CHP-%' OR p.barcode LIKE 'OS-WHB-%' OR p.barcode LIKE 'OS-COG-%'
    OR p.barcode LIKE 'OS-VOD-%' OR p.barcode LIKE 'OS-SPI-%' OR p.barcode LIKE 'OS-VIN-%'
    OR p.barcode LIKE 'OS-BIE-%' OR p.barcode LIKE 'OS-SFT-%'
  )
ORDER BY
  CASE c.name
    WHEN 'Champagnes' THEN 1 WHEN 'Whisky & Bourbon' THEN 2 WHEN 'Cognac & Prestige' THEN 3
    WHEN 'Vodka' THEN 4 WHEN 'Autres Spiritueux & Liqueurs' THEN 5 WHEN 'Bières' THEN 6
    WHEN 'Vins & Autres' THEN 7 WHEN 'Boissons gazeuses' THEN 8 ELSE 9
  END,
  p.selling_price DESC, p.name;
