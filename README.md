# ONE SHOT Manager

Premium Restaurant Management System for **ONE SHOT Lounge & Grill**.

Inventory, POS, Kitchen/Grill/Bar screens, invoices, reports — Next.js + Supabase.

## Tech Stack

- **Frontend:** Next.js (App Router), TypeScript, TailwindCSS, TanStack Query/Table, Framer Motion, Recharts
- **Backend:** Supabase (Auth, PostgreSQL, RLS, Storage, Realtime)

## Live Setup

### 1. Install

```bash
npm install
```

### 2. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com)
2. Copy `.env.local.example` → `.env.local`
3. Paste **Project URL** and **anon public** key from Supabase → Settings → API

### 3. Run SQL migrations

Option A (recommended, via CLI):

```bash
npm run supabase:login
npm run supabase:link -- --project-ref <your-project-ref>
npm run supabase:db:push
```

Option B (manual, Supabase SQL Editor), run in order:

1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_storage_buckets.sql`
3. `supabase/seed.sql` (optional starter categories / tables / products)

### 4. Auth

1. Supabase → Authentication → Providers → enable **Email**
2. Register at `/register`
3. Promote your user to admin:

```sql
UPDATE public.profiles SET role = 'administrator' WHERE email = 'your@email.com';
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) → login.

### Production

Set the same env vars on your host (Vercel, etc.):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

`SUPABASE_SERVICE_ROLE_KEY` is optional and only needed for privileged server/admin jobs.

```bash
npm run build
npm start
```

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Revenue, low stock, recent activity |
| **POS** | Checkout, tables, print receipt, kitchen routing |
| **Inventory** | Create/edit products + photos (Storage), stock movements |
| **Kitchen / Grill / Bar** | Live boards, tickets, status flow |
| **Tables** | Create / edit / delete tables |
| **Invoices / Orders** | History, print, complete / cancel |
| **Reports** | Period filters, CSV/Excel/PDF, activity journal |
| **Auth** | Login, register, forgot password, RLS by role |

## Roles

`administrator` · `manager` · `cashier` · `kitchen` · `grill` · `bar` · `store_keeper`

## Project Structure

```
src/
├── app/(auth)/          # Login, register, password reset
├── app/(dashboard)/     # App modules
├── components/          # UI, kitchen, print, layout
├── lib/supabase/        # Browser + server clients
└── types/
supabase/
├── migrations/          # Schema, RLS, Storage
└── seed.sql             # Optional starter data
```

## License

Private — ONE SHOT Lounge & Grill
