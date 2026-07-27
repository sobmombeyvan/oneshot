-- ONE SHOT Manager — Initial Database Schema
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Custom types
CREATE TYPE user_role AS ENUM (
  'administrator', 'manager', 'cashier', 'kitchen', 'grill', 'bar', 'store_keeper'
);

CREATE TYPE category_type AS ENUM ('lounge', 'grill', 'snack');

CREATE TYPE product_status AS ENUM ('active', 'inactive', 'discontinued');

CREATE TYPE stock_movement_type AS ENUM ('IN', 'OUT', 'ADJUSTMENT');

CREATE TYPE order_status AS ENUM (
  'pending', 'preparing', 'ready', 'served', 'completed', 'cancelled'
);

CREATE TYPE payment_method AS ENUM (
  'cash', 'orange_money', 'mtn_momo', 'bank_card', 'mixed'
);

CREATE TYPE table_status AS ENUM ('available', 'occupied', 'reserved', 'cleaning');

CREATE TYPE reservation_status AS ENUM ('pending', 'confirmed', 'cancelled', 'completed');

CREATE TYPE purchase_status AS ENUM ('pending', 'received', 'cancelled');

CREATE TYPE invoice_status AS ENUM ('draft', 'paid', 'partial', 'cancelled');

-- Profiles (extends auth.users)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fullname TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  role user_role NOT NULL DEFAULT 'cashier',
  avatar TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Categories
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type category_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Suppliers
CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  address TEXT,
  contact_person TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Products
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  barcode TEXT UNIQUE,
  image TEXT,
  purchase_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  minimum_stock INTEGER NOT NULL DEFAULT 5,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  status product_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Customers
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fullname TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  loyalty_points INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Restaurant tables
CREATE TABLE public.restaurant_tables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  number INTEGER NOT NULL UNIQUE,
  status table_status NOT NULL DEFAULT 'available',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Purchases
CREATE TABLE public.purchases (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status purchase_status NOT NULL DEFAULT 'pending',
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.purchase_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_id UUID NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL,
  price DECIMAL(12,2) NOT NULL
);

-- Stock movements
CREATE TABLE public.stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  type stock_movement_type NOT NULL,
  quantity INTEGER NOT NULL,
  reason TEXT,
  user_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Orders
CREATE TABLE public.orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_number INTEGER,
  table_id UUID REFERENCES public.restaurant_tables(id),
  cashier_id UUID REFERENCES public.profiles(id),
  status order_status NOT NULL DEFAULT 'pending',
  payment_method payment_method,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  price DECIMAL(12,2) NOT NULL,
  notes TEXT,
  station TEXT -- kitchen, grill, bar
);

-- Invoices
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_number TEXT NOT NULL UNIQUE,
  order_id UUID REFERENCES public.orders(id),
  customer_id UUID REFERENCES public.customers(id),
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method payment_method,
  status invoice_status NOT NULL DEFAULT 'draft',
  cashier_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reservations
CREATE TABLE public.reservations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  date DATE NOT NULL,
  time TIME NOT NULL,
  guests INTEGER NOT NULL DEFAULT 2,
  status reservation_status NOT NULL DEFAULT 'pending',
  table_id UUID REFERENCES public.restaurant_tables(id),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT FALSE,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_barcode ON public.products(barcode);
CREATE INDEX idx_orders_status ON public.orders(status);
CREATE INDEX idx_orders_created ON public.orders(created_at DESC);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
CREATE INDEX idx_stock_movements_product ON public.stock_movements(product_id);
CREATE INDEX idx_invoices_number ON public.invoices(invoice_number);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, fullname, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'fullname', NEW.email),
    NEW.email,
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'cashier')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Update product stock on movement
CREATE OR REPLACE FUNCTION public.update_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'IN' THEN
    UPDATE public.products SET stock = stock + NEW.quantity, updated_at = NOW()
    WHERE id = NEW.product_id;
  ELSIF NEW.type = 'OUT' THEN
    UPDATE public.products SET stock = stock - NEW.quantity, updated_at = NOW()
    WHERE id = NEW.product_id;
  ELSIF NEW.type = 'ADJUSTMENT' THEN
    UPDATE public.products SET stock = NEW.quantity, updated_at = NOW()
    WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_stock_movement
  AFTER INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.update_stock_on_movement();

-- Generate invoice number
CREATE OR REPLACE FUNCTION public.generate_invoice_number()
RETURNS TEXT AS $$
DECLARE
  seq INTEGER;
  prefix TEXT := 'OS';
  year_part TEXT := TO_CHAR(NOW(), 'YY');
BEGIN
  SELECT COUNT(*) + 1 INTO seq FROM public.invoices
  WHERE EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());
  RETURN prefix || year_part || LPAD(seq::TEXT, 6, '0');
END;
$$ LANGUAGE plpgsql;

-- Dashboard stats RPC
CREATE OR REPLACE FUNCTION public.get_dashboard_stats()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'today_revenue', COALESCE((
      SELECT SUM(total) FROM public.orders
      WHERE status = 'completed' AND created_at::DATE = CURRENT_DATE
    ), 0),
    'monthly_revenue', COALESCE((
      SELECT SUM(total) FROM public.orders
      WHERE status = 'completed'
        AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM NOW())
        AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW())
    ), 0),
    'inventory_value', COALESCE((
      SELECT SUM(stock * purchase_price) FROM public.products WHERE status = 'active'
    ), 0),
    'pending_orders', (
      SELECT COUNT(*) FROM public.orders
      WHERE status IN ('pending', 'preparing', 'ready')
    ),
    'low_stock_count', (
      SELECT COUNT(*) FROM public.products
      WHERE stock <= minimum_stock AND status = 'active'
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Helper: get current user role
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles policies
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT USING (public.get_user_role() IN ('administrator', 'manager'));
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can update profiles" ON public.profiles
  FOR UPDATE USING (public.get_user_role() = 'administrator');

-- Authenticated read for operational tables
CREATE POLICY "Authenticated read categories" ON public.categories
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage categories" ON public.categories
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager'));

CREATE POLICY "Authenticated read products" ON public.products
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Store keeper manage products" ON public.products
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'store_keeper'));

CREATE POLICY "Authenticated read suppliers" ON public.suppliers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Manager manage suppliers" ON public.suppliers
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'store_keeper'));

CREATE POLICY "Authenticated read customers" ON public.customers
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage customers" ON public.customers
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'cashier'));

CREATE POLICY "Authenticated read orders" ON public.orders
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage orders" ON public.orders
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'cashier', 'kitchen', 'grill', 'bar'));

CREATE POLICY "Authenticated read order_items" ON public.order_items
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage order_items" ON public.order_items
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'cashier', 'kitchen', 'grill', 'bar'));

CREATE POLICY "Authenticated read stock_movements" ON public.stock_movements
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Store keeper manage stock" ON public.stock_movements
  FOR INSERT WITH CHECK (public.get_user_role() IN ('administrator', 'manager', 'store_keeper'));

CREATE POLICY "Authenticated read invoices" ON public.invoices
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Cashier manage invoices" ON public.invoices
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'cashier'));

CREATE POLICY "Authenticated read reservations" ON public.reservations
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage reservations" ON public.reservations
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'cashier'));

CREATE POLICY "Authenticated read tables" ON public.restaurant_tables
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Staff manage tables" ON public.restaurant_tables
  FOR ALL USING (public.get_user_role() IN ('administrator', 'manager', 'cashier'));

CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);
CREATE POLICY "System insert notifications" ON public.notifications
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Users update own notifications" ON public.notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
