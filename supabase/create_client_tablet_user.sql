-- Dedicated tablet login (run AFTER 003_client_tablet_role.sql)
--
-- 1) In Supabase Dashboard → Authentication → Users → Add user:
--      Email:    tablette@oneshot.local
--      Password: (choose a strong password)
--      Auto Confirm: ON
--
-- 2) Then run this (replace the email if different):

UPDATE public.profiles
SET
  role = 'client',
  fullname = 'Tablette Client'
WHERE email = 'tablette@oneshot.local';

-- If no profile row exists yet, create one with the Auth user id:
-- INSERT INTO public.profiles (id, email, fullname, role)
-- SELECT id, email, 'Tablette Client', 'client'
-- FROM auth.users
-- WHERE email = 'tablette@oneshot.local'
-- ON CONFLICT (id) DO UPDATE
-- SET role = 'client', fullname = 'Tablette Client';
