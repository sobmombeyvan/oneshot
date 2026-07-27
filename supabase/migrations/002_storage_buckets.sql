-- Storage buckets & policies for ONE SHOT Manager (live)
-- Run in Supabase SQL Editor after 001_initial_schema.sql

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('products', 'products', true),
  ('avatars', 'avatars', true),
  ('invoices', 'invoices', false),
  ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- Public read for product images
CREATE POLICY "Public read products bucket"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'products');

CREATE POLICY "Staff upload products"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Staff update products"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "Staff delete products"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'products'
    AND auth.role() = 'authenticated'
  );

-- Avatars
CREATE POLICY "Public read avatars"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

CREATE POLICY "Users upload avatars"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'avatars' AND auth.role() = 'authenticated');

CREATE POLICY "Users update avatars"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'avatars' AND auth.role() = 'authenticated');
