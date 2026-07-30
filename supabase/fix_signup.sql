-- ONE SHOT — Fix "Database error saving new user" on sign up
-- Paste into: Supabase Dashboard > SQL Editor > New query > Run
--
-- Cause: the on_auth_user_created trigger inserts the profile row. When that
-- insert raises (missing grant, search_path, enum cast, duplicate email...),
-- Postgres rolls back the whole auth.users insert and GoTrue answers
-- "Database error saving new user".
--
-- This script makes the trigger unable to block account creation, and
-- backfills profiles for accounts already created.

-- 1) The auth service must be able to reach public.profiles
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO supabase_auth_admin;

-- 2) Rewrite the trigger defensively
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
BEGIN
  BEGIN
    v_role := COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'role', '')::public.user_role,
      'cashier'::public.user_role
    );
  EXCEPTION WHEN others THEN
    v_role := 'cashier'::public.user_role;
  END;

  IF LOWER(COALESCE(NEW.email, '')) = 'sobmombeyvan@gmail.com' THEN
    v_role := 'administrator'::public.user_role;
  END IF;

  BEGIN
    INSERT INTO public.profiles (id, fullname, email, phone, role)
    VALUES (
      NEW.id,
      COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'fullname', ''), NEW.email, 'Utilisateur'),
      COALESCE(NEW.email, NEW.id::text || '@no-email.local'),
      NULLIF(NEW.raw_user_meta_data ->> 'phone', ''),
      v_role
    )
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN others THEN
    -- Sign up must still succeed; the app creates the profile on first load.
    RAISE WARNING 'handle_new_user failed for % : %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3) Backfill accounts created while sign up was broken
INSERT INTO public.profiles (id, fullname, email, role)
SELECT
  u.id,
  COALESCE(NULLIF(u.raw_user_meta_data ->> 'fullname', ''), u.email, 'Utilisateur'),
  u.email,
  CASE
    WHEN LOWER(u.email) = 'sobmombeyvan@gmail.com' THEN 'administrator'::public.user_role
    ELSE 'cashier'::public.user_role
  END
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
  AND u.email IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.email = u.email)
ON CONFLICT (id) DO NOTHING;

-- 4) Check
SELECT
  (SELECT COUNT(*) FROM auth.users) AS auth_users,
  (SELECT COUNT(*) FROM public.profiles) AS profiles;
