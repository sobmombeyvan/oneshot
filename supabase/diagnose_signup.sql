-- ONE SHOT — Show what is really behind "Failed to create user: {}"
-- Paste into: Supabase Dashboard > SQL Editor > New query > Run
-- Read-only. Copy the whole result table back.

SELECT 'trigger on auth.users' AS kind, t.tgname AS name, pg_get_triggerdef(t.oid) AS detail
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'auth' AND c.relname = 'users' AND NOT t.tgisinternal

UNION ALL
SELECT 'enum user_role', 'values',
       COALESCE(string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder), 'TYPE MISSING')
FROM pg_enum e
WHERE e.enumtypid = 'public.user_role'::regtype

UNION ALL
SELECT 'profiles column', c.column_name,
       c.data_type || ' | nullable=' || c.is_nullable || ' | default=' || COALESCE(c.column_default, '-')
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'profiles'

UNION ALL
SELECT 'profiles constraint', con.conname, pg_get_constraintdef(con.oid)
FROM pg_constraint con
WHERE con.conrelid = 'public.profiles'::regclass

UNION ALL
SELECT 'function', p.proname, pg_get_functiondef(p.oid)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname IN ('handle_new_user', 'get_user_role')

UNION ALL
SELECT 'grants on profiles', g.grantee, string_agg(g.privilege_type, ', ')
FROM information_schema.role_table_grants g
WHERE g.table_schema = 'public' AND g.table_name = 'profiles'
GROUP BY g.grantee

UNION ALL
SELECT 'counts', 'auth.users / public.profiles',
       (SELECT COUNT(*) FROM auth.users)::text || ' / ' || (SELECT COUNT(*) FROM public.profiles)::text

UNION ALL
SELECT 'orphan auth user', u.email, u.id::text
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL

UNION ALL
SELECT 'orphan profile', p.email, p.id::text
FROM public.profiles p
LEFT JOIN auth.users u ON u.id = p.id
WHERE u.id IS NULL;
