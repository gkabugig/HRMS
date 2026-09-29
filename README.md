# HRMS

A multi-user Human Resource Management System for Kenyan organizations, built with
Next.js (App Router) and Supabase (Postgres + Auth + Row-Level Security).

## What's built

- **Auth**: email/password sign-in. The first person to sign up becomes org admin
  automatically (via the `bootstrap_admin` RPC). Everyone after that needs to be
  added to `app_users` by an admin.
- **Role-aware app**: Admin / HR / Manager / Employee each see a different nav and
  different data, enforced by Postgres Row-Level Security — not just hidden in the UI.
- **Employees** — list + add, admin/HR only.
- **Leave** — apply (employee), approve/reject (manager for their reports, HR/admin for
  everyone).
- **Payroll** — "Run payroll" computes real Kenyan PAYE, NSSF (tiered), SHIF, and the
  Affordable Housing Levy per employee from the `statutory_rates` table (versioned by
  effective date, so past payslips don't change when rates change), including salary
  advance deductions. Employees see only their own payslips.
- **Settings** — admin/HR can edit statutory rates live.

**Not yet built** (schema + RLS policies exist, UI doesn't): Recruitment, Attendance,
Performance, Learning & Development, Compliance, Offboarding. Each has a placeholder
page under `src/app/dashboard/<module>/page.tsx` — see `supabase/migrations/0001_schema.sql`
for their tables.

## Database

Migrations live in `supabase/migrations/`, applied in order:

1. `0001_schema.sql` — all 24 tables
2. `0002_rls.sql` — RLS policies (admin/HR full access, manager sees their team,
   employee sees only themselves; payroll and statutory rates are deliberately
   invisible to managers)
3. `0003_bootstrap_and_seed.sql` — the `bootstrap_admin()` first-user RPC, a default
   organization row, Kenya statutory rates (2026), and default leave entitlements
4. `0004_harden_functions.sql` — locks down the RLS helper functions so they can't be
   called directly as public RPC endpoints

These have already been applied to the live Supabase project. If you ever need to
re-apply them elsewhere (a new environment, a reset project), run them in order via
the Supabase SQL editor or `supabase db push`.

## Running locally

```bash
npm install
cp .env.local.example .env.local   # fill in your Supabase URL + anon key
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Use "First time here?
Set up admin account" to create the first user, which becomes admin automatically.

## Deploying (Vercel)

1. Push this repo to GitHub (already done if you're reading this on GitHub).
2. Go to vercel.com → Add New → Project → import this repo.
3. Add two environment variables when prompted:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (values are in your local `.env.local`, or Supabase dashboard → Settings → API)
4. Deploy. First visit, sign up as the admin.

## Architecture notes

- `src/lib/payroll/calculate.ts` — pure functions for PAYE/NSSF/SHIF/Housing Levy,
  no framework or DB dependencies, easy to unit test.
- `src/lib/auth/roles.ts` — the role → nav-tabs mapping used by the dashboard layout.
- `src/lib/supabase/{client,server}.ts` — browser vs. server Supabase clients
  (`@supabase/ssr`), plus `src/proxy.ts` for session refresh (this Next.js version
  renamed `middleware.ts` → `proxy.ts` — see `AGENTS.md`).
- `src/lib/supabase/types.ts` is currently `any` — regenerate proper types with:
  ```bash
  npx supabase gen types typescript --project-id tuoyazzbipxoaelxahuy > src/lib/supabase/types.ts
  ```
