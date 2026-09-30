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
- **Recruitment** — requisitions (manager auto-assigned as hiring manager, HR/admin can
  pick anyone), candidate pipeline with stage tracking, onboarding checklist, and a
  "hire" action that creates the real `employees` row from an offered candidate.
- **Attendance** — clock in/out (self-service for employees, manual entry for HR/admin/
  manager), late-arrival and missing-clock-out flags.
- **Performance** — HR/admin opens an appraisal cycle per employee; goals with weights;
  self and manager ratings; self and manager comments; "Finalize" computes a weighted
  final score out of 5.
- **Learning & Development** — HR/admin manages the course catalog and can enroll any
  employee; employees can self-enroll; HR/admin marks enrollments complete (with an
  optional certificate note).
- **Compliance** — statutory filing log (PAYE/NSSF/SHIF/Housing Levy/NITA, HR/admin
  only), compliance document expiry tracking with automatic expiring/expired flags,
  and org-wide policies that employees acknowledge.
- **Offboarding** — HR/admin initiates an exit with a seeded asset-return checklist,
  records the exit interview and final dues, and "Complete offboarding" flips the
  linked employee's status to Terminated (blocked until all assets are returned).

All six of these were built directly against the live schema and RLS policies in
`supabase/migrations/0001_schema.sql`/`0002_rls.sql` — no placeholders remain.

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
5. `0005_attendance_self_update.sql` — lets employees update their own same-day
   attendance row (needed for the clock-in → clock-out upsert flow)
6. `0006_appraisal_goals_update.sql` — lets employees set their own `self_rating` and
   managers set `manager_rating` on their team's appraisal goals
7. `0007_harden_functions_public_grant.sql` — 0004's revoke only targeted the `anon`
   role, but Postgres grants EXECUTE to `PUBLIC` by default and `anon` inherits that,
   so the helper functions were still callable anonymously; this revokes from `PUBLIC`
   and grants back to `authenticated` only

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
