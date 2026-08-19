-- ONE SHOT — Carte lounge (ordre prioritaire officiel)
-- Run in Supabase SQL Editor, puis sync_lounge_carte.sql pour fusionner l'existant.

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

INSERT INTO public.products (
  name, description, barcode, purchase_price, selling_price,
  stock, minimum_stock, category_id, status
)
SELECT
  v.name, v.description, v.barcode, 0, v.price, 100, 5,
  (SELECT c.id FROM public.categories c WHERE LOWER(c.name) = LOWER(v.category) ORDER BY c.created_at LIMIT 1),
  'active'::product_status
FROM (VALUES
  ('Fruites', NULL::text, 'OS-SFT-001', 5000::decimal, 'Boissons gazeuses'),
  ('Tonic', NULL, 'OS-SFT-002', 1000::decimal, 'Boissons gazeuses'),
  ('Sprite', NULL, 'OS-SFT-003', 1000::decimal, 'Boissons gazeuses'),
  ('Red Bull', NULL, 'OS-SFT-004', 2000::decimal, 'Boissons gazeuses'),
  ('Coca-Cola', NULL, 'OS-SFT-005', 1000::decimal, 'Boissons gazeuses'),
  ('Schweppes', NULL, 'OS-SFT-006', 1000::decimal, 'Boissons gazeuses'),
  ('Eau plate – petite', NULL, 'OS-SFT-007', 1500::decimal, 'Boissons gazeuses'),
  ('Eau pétillante – petite', NULL, 'OS-SFT-008', 2000::decimal, 'Boissons gazeuses'),
  ('Eau plate – grande', NULL, 'OS-SFT-009', 3500::decimal, 'Boissons gazeuses'),
  ('Eau pétillante – grande', NULL, 'OS-SFT-010', 3500::decimal, 'Boissons gazeuses'),

  ('Armand de Brignac', NULL, 'OS-CHP-001', 500000::decimal, 'Champagnes'),
  ('Cristal', NULL, 'OS-CHP-002', 300000::decimal, 'Champagnes'),
  ('Dom Pérignon Rosé', NULL, 'OS-CHP-003', 300000::decimal, 'Champagnes'),
  ('Dom Pérignon Brut', NULL, 'OS-CHP-004', 250000::decimal, 'Champagnes'),
  ('Veuve Rich', NULL, 'OS-CHP-005', 120000::decimal, 'Champagnes'),
  ('Ruinart Blanc des Blancs', NULL, 'OS-CHP-006', 120000::decimal, 'Champagnes'),
  ('Moët Nectar', NULL, 'OS-CHP-007', 100000::decimal, 'Champagnes'),
  ('Ruinart Brut', NULL, 'OS-CHP-008', 95000::decimal, 'Champagnes'),
  ('Veuve Clicquot Brut', NULL, 'OS-CHP-009', 90000::decimal, 'Champagnes'),
  ('Laurent Perrier Brut', NULL, 'OS-CHP-010', 70000::decimal, 'Champagnes'),
  ('Moët Brut', NULL, 'OS-CHP-011', 70000::decimal, 'Champagnes'),

  ('Chivas 18 ans', NULL, 'OS-WHB-001', 130000::decimal, 'Whisky & Bourbon'),
  ('Glenfiddich 18 ans', NULL, 'OS-WHB-002', 120000::decimal, 'Whisky & Bourbon'),
  ('Gold Label', NULL, 'OS-WHB-003', 110000::decimal, 'Whisky & Bourbon'),
  ('Platinum Label', NULL, 'OS-WHB-004', 110000::decimal, 'Whisky & Bourbon'),
  ('Martell 18 ans', NULL, 'OS-WHB-014', 100000::decimal, 'Whisky & Bourbon'),
  ('Glenfiddich 12 ans', NULL, 'OS-WHB-005', 80000::decimal, 'Whisky & Bourbon'),
  ('Chivas 15 ans', NULL, 'OS-WHB-006', 80000::decimal, 'Whisky & Bourbon'),
  ('Double Black', NULL, 'OS-WHB-007', 80000::decimal, 'Whisky & Bourbon'),
  ('Monkey Shoulder', NULL, 'OS-WHB-008', 60000::decimal, 'Whisky & Bourbon'),
  ('Chivas 12 ans', NULL, 'OS-WHB-009', 55000::decimal, 'Whisky & Bourbon'),
  ('Jack Daniel''s 1L', NULL, 'OS-WHB-010', 55000::decimal, 'Whisky & Bourbon'),
  ('Jack Daniel''s Honey', NULL, 'OS-WHB-011', 45000::decimal, 'Whisky & Bourbon'),
  ('Ballantine 12 ans', NULL, 'OS-WHB-012', 45000::decimal, 'Whisky & Bourbon'),
  ('Ballantine 15', NULL, 'OS-WHB-013', 35000::decimal, 'Whisky & Bourbon'),

  ('Clase Azul', NULL, 'OS-COG-001', 500000::decimal, 'Cognac & Prestige'),
  ('Hennessy XO', NULL, 'OS-COG-002', 260000::decimal, 'Cognac & Prestige'),
  ('Martell 18 ans', NULL, 'OS-COG-003', 100000::decimal, 'Cognac & Prestige'),
  ('Martell 12 ans', NULL, 'OS-COG-004', 55000::decimal, 'Cognac & Prestige'),

  ('Magnum Belvédère', NULL, 'OS-VOD-001', 150000::decimal, 'Vodka'),
  ('Belvedere 75 cl', NULL, 'OS-VOD-002', 75000::decimal, 'Vodka'),
  ('Absolut fruitée', NULL, 'OS-VOD-003', 45000::decimal, 'Vodka'),
  ('Absolut 1L', NULL, 'OS-VOD-004', 40000::decimal, 'Vodka'),

  ('Baileys', 'Bouteille', 'OS-SPI-001', 30000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Baileys', 'Verre', 'OS-SPI-002', 20000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Martini', 'Bouteille', 'OS-SPI-003', 30000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Martini', 'Verre', 'OS-SPI-004', 20000::decimal, 'Autres Spiritueux & Liqueurs'),
  ('Moscato', NULL, 'OS-SPI-005', 30000::decimal, 'Autres Spiritueux & Liqueurs'),

  ('Pack bière (20 bières)', NULL, 'OS-BIE-001', 50000::decimal, 'Bières'),

  ('Moscato', NULL, 'OS-VIN-001', 30000::decimal, 'Vins & Autres'),
  ('Martini', NULL, 'OS-VIN-002', 30000::decimal, 'Vins & Autres'),
  ('Baileys', NULL, 'OS-VIN-003', 30000::decimal, 'Vins & Autres')
) AS v(name, description, barcode, price, category)
ON CONFLICT (barcode) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  selling_price = EXCLUDED.selling_price,
  category_id = EXCLUDED.category_id,
  status = 'active'::product_status,
  updated_at = NOW();
