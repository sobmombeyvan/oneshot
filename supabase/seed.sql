-- ONE SHOT Manager — Optional starter data (live)
-- Run after 001_initial_schema.sql and 002_storage_buckets.sql

INSERT INTO public.categories (name, type) VALUES
  ('Cocktails', 'lounge'),
  ('Beer', 'lounge'),
  ('Soft Drinks', 'lounge'),
  ('Wine', 'lounge'),
  ('Shots', 'lounge'),
  ('Grill Specials', 'grill'),
  ('Steaks', 'grill'),
  ('Burgers', 'grill'),
  ('Snacks', 'snack'),
  ('Appetizers', 'snack');

INSERT INTO public.restaurant_tables (number, status) VALUES
  (1, 'available'), (2, 'available'), (3, 'available'),
  (4, 'available'), (5, 'available'), (6, 'available'),
  (7, 'available'), (8, 'available'), (9, 'available'),
  (10, 'available'), (11, 'available'), (12, 'available');

INSERT INTO public.suppliers (company_name, phone, email, contact_person) VALUES
  ('Fresh Foods Ltd', '+237 6XX XXX XXX', 'orders@freshfoods.cm', 'Jean Dupont'),
  ('Beverage Supply Co', '+237 6XX XXX XXX', 'sales@bevsupply.cm', 'Marie Claire'),
  ('Grill Provisions', '+237 6XX XXX XXX', 'info@grillpro.cm', 'Paul Nkoulou');

INSERT INTO public.products (name, description, barcode, purchase_price, selling_price, stock, minimum_stock, category_id, status)
SELECT p.name, p.description, p.barcode, p.purchase_price, p.selling_price, p.stock, p.minimum_stock, c.id, 'active'::product_status
FROM (VALUES
  ('Mojito Classic', 'Fresh mint, lime, rum', 'OS001001', 800::decimal, 3500::decimal, 50, 10, 'Cocktails'),
  ('Old Fashioned', 'Bourbon, bitters, orange', 'OS001002', 1200::decimal, 4500::decimal, 40, 10, 'Cocktails'),
  ('Castel Beer', '330ml bottle', 'OS002001', 400::decimal, 1500::decimal, 120, 24, 'Beer'),
  ('Heineken', '330ml bottle', 'OS002002', 500::decimal, 1800::decimal, 96, 24, 'Beer'),
  ('Coca-Cola', '330ml can', 'OS003001', 200::decimal, 800::decimal, 200, 48, 'Soft Drinks'),
  ('Red Wine Glass', 'House red wine', 'OS004001', 1500::decimal, 4000::decimal, 30, 6, 'Wine'),
  ('Tequila Shot', 'Premium tequila 40ml', 'OS005001', 600::decimal, 2000::decimal, 60, 12, 'Shots'),
  ('Grilled Ribeye', '300g premium ribeye', 'OS006001', 3500::decimal, 12000::decimal, 25, 5, 'Grill Specials'),
  ('Mixed Grill Platter', 'Assorted grilled meats', 'OS006002', 5000::decimal, 18000::decimal, 15, 3, 'Grill Specials'),
  ('Classic Burger', 'Beef patty, cheese, fries', 'OS007001', 1200::decimal, 4500::decimal, 40, 10, 'Burgers'),
  ('Chicken Wings', 'Spicy buffalo wings', 'OS008001', 800::decimal, 3500::decimal, 50, 10, 'Snacks'),
  ('Loaded Nachos', 'Cheese, jalapeños, salsa', 'OS009001', 600::decimal, 3000::decimal, 35, 8, 'Appetizers')
) AS p(name, description, barcode, purchase_price, selling_price, stock, minimum_stock, cat_name)
JOIN public.categories c ON c.name = p.cat_name;
