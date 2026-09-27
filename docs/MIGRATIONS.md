# Migrations

Every schema change in this project is a numbered file in `supabase/migrations/`. There is no migration
runner: the Supabase CLI is not available on the dev machines here (`SUPABASE_PROJECT_ID` is unset, see
`scripts/gen-types.sh`), so each file is pasted into the **Supabase Dashboard → SQL Editor** and run by
hand, in order, as the `postgres` role. That role owns the tables in `public`, which matters for
`0013` — its `snapshot_content_version()` is `SECURITY DEFINER`.

Never edit a file that has already been run anywhere. Corrections go into the next number.

## Apply order

| # | File | What it does | Depends on |
| --- | --- | --- | --- |
| 0001 | `custom_access_token_hook.sql` | `app_metadata.role` claim from `allowed_users` | `allowed_users` (0013) |
| 0002 | `content_tables.sql` | 7 content tables, `content_versions`, update triggers, RLS | — |
| 0003 | `content_tables_grants.sql` | `GRANT`s for 0002 (RLS alone grants nothing) | 0002 |
| 0004 | `content_ru_columns.sql` | `*_ru` columns for the Russian locale | 0002 |
| 0005 | `dashboard_policies.sql` | manager reads `allowed_users` (operator filter) | `allowed_users` (0013) |
| 0006 | `copilot_logs.sql` | copilot request log | — |
| 0007 | `notifications_and_gate.sql` | `admin_notifications`, `content_gate_reports` | — |
| 0008 | `rate_limits.sql` | durable rate limiter + `rate_limit_hit()` | — |
| 0009 | `user_state.sql` | per-user state (onboarding, pins, read receipts) | — |
| 0010 | `content_changelog.sql` | `content_changelog` | 0002 (trigger functions) |
| 0011 | `content_contacts.sql` | `content_contacts` | 0002 |
| 0012 | `content_sops.sql` | `content_sops` | 0002 |
| 0013 | `baseline_and_audit_integrity.sql` | baseline for `allowed_users` + `telemetry_events`; `status` defaults to `'draft'`; `updated_by` stamped by the DB; delete snapshots; `content_versions` locked down | 0002, 0010–0012 |
| 0014 | `role_gated_rls.sql` | `private.app_role/is_member/is_manager`; every policy role-gated and InitPlan-wrapped; the access-token hook refuses instead of stamping `'none'` | 0013 (and 0009, see below) |
| 0015 | `reorder_rows.sql` | `public.reorder_content_rows(text, text[], int[])` — version-guarded, all-or-nothing `sort_order` write for a whole list | 0014 (`private.is_manager()`) |
| 0016 | `dashboard_rpc_and_retention.sql` | seven `public.dashboard_*` aggregate functions (manager only), covering indexes on `telemetry_events`, `public.run_retention()` and its pg_cron job when pg_cron is enabled | 0014, 0006, 0007, 0013 |
| 0017 | `user_admin_and_access_audit.sql` | managers write `allowed_users` (insert; update of `role`/`is_active`/`full_name` only); `private.allowed_users_guard` (stale-manager WT403, last manager WT460, self-change WT461); append-only `public.access_audit` written by trigger; `public.admin_user_last_activity()` | 0014, 0013, 0002 |
| 0018 | `product_images.sql` | public Storage bucket `product-images` (2 MB, JPEG/PNG/WebP/AVIF); manager-only select/insert/update/delete policies on `storage.objects` for that bucket (writes under `products/` only); `content_products.image_path` with a shape check; `content_products.filename` nullable | 0014 (`private.is_manager()`), 0002, Storage enabled |
| 0019 | `copilot_stats.sql` | `public.copilot_stats(p_from, p_to)` (request counts, no-hits / error rate, p50 / p95 latency) and `public.copilot_unanswered(p_from, p_to, p_limit)` (no-hits questions grouped by a normalized form; operator counts, never emails), both manager only (WT403); `private.copilot_normalize_question()` mirroring `lib/search/normalize.ts` | 0014 (`private.is_manager()`), 0006 |
| 0020 | `roles_admin_manager.sql` | Role model v2: `private.is_admin()`; `private.is_manager()` becomes its deprecated alias, so every 0014–0019 policy and function body means "admin"; `private.is_member()` covers `operator`/`manager`/`admin`; `allowed_users_role_chk` accepts `admin` (validated); the guard gets admin semantics (last admin WT460, self WT461, admin rows SQL-editor-only WT462); every `manager` row becomes `admin`, on the first run only | 0014, 0017 (and, by apply order, 0019) |
| 0021 | `people_analytics.sql` | People analytics for the admin panel (R3/S02): `public.admin_people_overview`, `admin_person_summary`, `admin_person_daily`, `admin_person_sections`, `admin_person_recent_events`, `admin_top_content` — admin only (WT403), WT400 for bad arguments, no admin's telemetry counted; private helpers; `dashboard_operator_activity`'s checklist logic moved into `private.dashboard_checklist_completed`, which it now calls (same numbers) | 0016, 0020 |
| 0022 | `person_removal.sql` | Removing a person from `/admin/users`: `GRANT DELETE` on `allowed_users` to `authenticated` + policy `allowed_users_admin_delete` (`is_admin()`; the 0017/0020 guard already refuses WT403 → WT460 → WT461 → WT462 on a DELETE, and the audit trigger records it); `public.admin_purge_person_history(p_email)` — SECURITY DEFINER, deletes one person's `telemetry_events` / `user_state` / `copilot_logs` rows, WT403 (claim, then the caller's row) / WT400 / WT461 / WT462, `EXECUTE` for `authenticated` only; refuses to run unless its owner skips RLS on those tables | 0020 (and, by apply order, 0021) |
| 0023 | `attestation.sql` | The attestation (R4/S04, [ATTESTATION.md](ATTESTATION.md)): six tables — `assessment_config` (the singleton with the defaults), `assessment_items`, `assessment_attempts`, `assessment_messages`, `assessment_unlocks`, `assessment_audit` — each with RLS, an admin-only permissive policy **and** a restrictive admin-only one, and no policy an operator or a sales manager passes; version triggers; append-only transcript and audit; `SECURITY DEFINER` audit triggers on items and config; five `SECURITY DEFINER` admin functions (`admin_assessment_override`, `_clear_override`, `_reset`, `_reset_person`, `_unlock`); the service role's grants narrowed to what S05 writes; `admin_purge_person_history` re-created to delete attestation rows too; `public.run_assessment_retention()` (service role only) and its pg_cron job when pg_cron is enabled | 0022 (and 0020, 0014, 0013, 0002) |

### Which files has a project had?

There is no migrations table, so ask the catalog: paste
[supabase/tests/migration-status.sql](../supabase/tests/migration-status.sql) into the SQL editor and run
it. It is **read-only** — safe on production — and answers one row per file (`0001` … `0023`, `true` when
the object only that file creates exists) plus three facts that should all be `true` (RLS on every public
table, no policy naming `anon`, the access-token hook executable by `supabase_auth_admin` only). The first
`false` row is the next file to apply. Whether the hook is *enabled* is a dashboard setting no query can
see (SECURITY.md §3).

**Not replayable in filename order.** `0001` and `0005` need `allowed_users`, which `0013` creates, so a
runner that applies files strictly by name — `supabase db reset` — stops at `0001` with
`relation "public.allowed_users" does not exist`. Use the orders below; adopting the Supabase CLI means
adding a bootstrap first (AUDIT.md open item O6).

**Verified (Audit-2, 2026-09-23)** in PGlite (PostgreSQL 18 in WebAssembly, with a stub of Supabase's
roles, default privileges, `auth.jwt()` and Storage tables): both orders below apply cleanly, `0013`–`0019`
re-apply idempotently, and all five `supabase/tests/*-checks.sql` files pass on the result. `0020` was
verified the same way (R3/S01, 2026-09-24) on both paths, with its re-run, every preflight abort, the
first-run-only conversion and the rollback below exercised, and 25 injected faults in it each caught by the
check files or those scenarios. `0021` likewise (R3/S02, 2026-09-24): both paths, its re-run, a re-run of
`0016` after it, both rollback levels below, and 46 injected faults each caught by `people-checks.sql`,
`dashboard-parity.sql` or `rls-checks.sql`. `0022` likewise (person removal, 2026-09-26): both paths, its re-run
(also after a re-run of `0017`), every preflight abort (no 0020, a guard body from 0017, a guard not bound to
DELETE, a JWT on the session), the owner check, the rollback below (after which the pre-0022 `rls-checks.sql` and
`people-checks.sql` pass again) and its order against 0020's rollback; 31 of 33 injected faults were caught by
`rls-checks.sql` or `people-checks.sql` — the two left are not observable in one session (dropping the advisory lock)
or under Supabase's default privileges (dropping the explicit `EXECUTE` grant). `0023` (the attestation, R4/S04,
2026-09-26) on a local PostgreSQL 16 with the same kind of stub: applied on a database at `0022` (reached by the fresh
path), re-run twice, both preflight aborts (no `0022`; a JWT on the session), every `supabase/tests/*.sql` file passing
after it, the rollback below followed by a re-run of `0022` (after which the pre-0023 checks pass and
`migration-status.sql` reads `0023` false) and `0023` applied again; the 32 staging-seed rows inserted as the service
role and accepted by the database's publish rule; 23 injected faults each caught by `attestation-checks.sql`. PostgREST,
GoTrue, pg_cron and Storage itself were not exercised — the staging runs are still the gate. The condensed
production sequence, with the dashboard steps in place, is [AUDIT.md §F](AUDIT.md#f-production-apply-order).

### An existing project (staging, production)

Run the pending files in numeric order, one at a time, checking the result of each before the next.
`0014`, `0015`, `0016`, `0017`, `0018`, `0019`, `0020`, `0021`, `0022` and then `0023` go last. `0013` through `0023` all abort with a clear
message when an earlier file is missing, so the order is enforced rather than assumed.

`0014` is a security fix, and applying the SQL is only half of it: the access-token hook it rewrites has
no effect until it is **enabled in the dashboard** (Authentication → Hooks). That step and the rest of
the manual configuration are the checklist in [SECURITY.md](SECURITY.md#3-dashboard-checklist--the-owners-manual-steps).

`0013` runs as one transaction and builds three indexes on `telemetry_events`, which blocks writes to
that table (`/api/events`) until it commits. At this project's volume that is a second or two, and a
batch that does time out is retried on the client's next flush (`lib/telemetry/client.ts`), so an
in-flight event is not lost. `CREATE INDEX CONCURRENTLY` is not an option
inside a transaction — if the table ever grows enough for this to matter, move the three index
statements into their own file and run them concurrently, outside a transaction.

### A fresh project

`0001` and `0005` reference `public.allowed_users`, which `0013` creates — so `0013` runs twice:

1. **`0013` first.** It creates `allowed_users` and `telemetry_events`, then reports
   `no content_* table found — baseline sections applied only` and stops there. It deliberately does
   *not* create the `allowed_users` policies on this pass, because `0001` and `0005` still have to
   create their own.
2. **`0001` → `0012`** in order.
3. **`0013` again.** Now the content sections run: `status` defaults, the `stamp_content_actor` and
   delete-snapshot triggers, `content_versions.op`, and the `content_versions` lockdown. Every
   statement in the file is idempotent, so the second pass re-applies the baseline harmlessly.
4. **`0014`.** Once, after `0013`'s second pass.
5. **`0015`.** After `0014` — it checks for `private.is_manager()` and aborts without it.
6. **`0016`.** After `0015`, same check.
7. **`0017`.** After `0016`. On a fresh project it notices that there is no active manager yet — ignore
   that notice: the first admin is added after `0020` (step 10).
8. **`0018`.** After `0017` (it needs only `0014`'s `private.is_manager()`, and Storage enabled on the project).
9. **`0019`.** After `0018` (it needs only `0014`'s `private.is_manager()` and `0006`'s `copilot_logs`).
10. **`0020`.** After `0019`. It reports no `manager` row to convert and no active admin — add the first
    admin by hand, as the notice says:
    `insert into public.allowed_users (email, role) values ('owner@gmail.com', 'admin');`
    Everyone after that (operators, sales managers) is added at `/admin/users`.
11. **`0021`.** After `0020` (it checks for `private.is_admin()` and the 0016 functions).
12. **`0022`.** After `0021` (it checks for `private.is_admin()` and 0020's guard).
13. **`0023`.** After `0022` (it checks for `private.is_admin()`, 0022's `admin_purge_person_history` and the 0002 /
    0013 trigger functions).
14. `npm run seed:content` to load the content tables from `lib/content/*.ts` — and, on staging, the attestation's
    draft items (it needs `0023`).

## Pending checklist

As of 2026-09-22 the live project is believed to be at **0007** — confirm with `migration-status.sql`
before starting: the Audit-2 build read `content_sops` rows from the project in `.env.local`, so either
that is staging or the belief is stale. Tick these off as they are applied:

- [ ] **0008** `rate_limits` — until it is applied `/api/copilot` fails closed with 503.
- [ ] **0010** `content_changelog` — the changelog page shows its empty state and the admin list errors.
- [ ] **0011** `content_contacts` — the contacts page shows its empty state.
- [ ] **0012** `content_sops` — the six `/tools/amocrm/*` pages 404 until this **and** `npm run seed:content` have run.
- [ ] **0013** baseline + audit integrity — requires 0010–0012 first.
- [ ] **0014** role-gated RLS + the refusing access-token hook — requires 0013 first. **P0**: until it is
      applied, any Google account that completes the OAuth flow with the public anon key can read every
      content table over PostgREST.
- [ ] **0015** `reorder_content_rows` — requires 0014 first. Nothing calls it until the drag-and-drop
      list UI lands in S12, so an unapplied 0015 breaks nothing today; `reorderRows()` would answer
      `unknown` (the RPC is missing) if it were called.
- [ ] **0016** dashboard functions + retention — requires 0014 first. **Apply it before (or together with)
      deploying the code that calls it**: from S09 on the dashboard reads only through these functions, so
      until 0016 exists every telemetry widget on `/admin`, `/admin/knowledge` and `/admin/system`
      shows its error state (the RPC is missing), and `/api/cron/content-scan` answers `retention_failed`
      after its scan. Nothing an operator sees is affected.
- [ ] `supabase/tests/dashboard-parity.sql` and `retention-checks.sql` on staging, after 0016.
- [ ] **0017** allow-list administration + `access_audit` — requires 0014 first. Until it is applied,
      `/admin/users` lists the users (the read policy is 0014's) but every add / role change / deactivate
      answers `unauthorized` (no write grant, no policy), and the "last activity" column is empty with a
      notice. Nothing else is affected. Also set `SUPABASE_SERVICE_ROLE_KEY` on the server if it is not
      already: without it the row changes but the Auth ban does not (`auth_sync_failed`).
- [ ] **0018** product photos — requires 0014 first. **Apply it before deploying the code that uses it**: the admin
      upload writes `image_path`, which answers `unknown` until the column exists, and `/admin/products/new` cannot
      save a product without a `filename` until that column is nullable. The catalog is unaffected either way: a row
      without `image_path` renders its legacy `/products/<filename>`. Then run `supabase/tests/storage-checks.sql`
      on staging.
- [ ] **0019** copilot statistics — requires 0014 and 0006. Until it is applied `/admin/knowledge#copilot` shows its error
      state in both widgets (the RPC is missing); nothing else is affected. Then run `supabase/tests/copilot-checks.sql`
      on staging.
- [ ] **0020** role model v2 (admin · manager · operator) — requires 0014–0019. **Apply it and deploy the release
      that knows the three roles in one sitting, then every admin signs out and back in**: either half alone locks
      the owner out of the admin panel until the other lands (operators are unaffected). Owner steps and rollback:
      [After applying 0020](#after-applying-0020--owner-steps).
- [ ] **0021** people analytics — requires 0016 and 0020. The R3 release calls its functions from `/admin` (overview),
      `/admin/users` and `/admin/users/<email>`: until it is applied those widgets show their error state (each fails
      alone, CLAUDE.md §15), while `/admin/knowledge` (0016 / 0019 functions) keeps working. Apply it with the R3 release, then run
      `supabase/tests/people-checks.sql` on staging. Owner steps: [After applying 0021](#after-applying-0021--owner-steps).
- [ ] **0022** person removal — requires 0020 (and 0021 by order). **Apply it before (or with) the release that has
      the remove action**: without it a removal deletes the person's Supabase Auth account and then fails (`unknown` /
      `unauthorized`), leaving them listed and active with no Auth account until it is applied and the removal
      retried. Owner steps: [After applying 0022](#after-applying-0022--owner-steps).
- [ ] **0023** the attestation — requires 0022. **Apply it before (or with) the release that has "Attestatsiya" in
      the admin nav**: until it exists the results and item-bank pages fail to load (their reads error), the settings
      page shows the defaults and cannot save, and the daily cron answers `assessment_retention_failed` after running
      the other retention.
      Operators are unaffected (S04 has no candidate UI). Then run `supabase/tests/attestation-checks.sql` on staging.
      Owner steps: [After applying 0023](#after-applying-0023--owner-steps).
- [ ] Enable the Custom Access Token hook and walk the rest of
      [SECURITY.md §3](SECURITY.md#3-dashboard-checklist--the-owners-manual-steps) — 0014's SQL does
      nothing on its own.
- [ ] `npm run gen:types` after 0013 (see below).
- [ ] `supabase/tests/rls-checks.sql` on staging, after 0014.

`0009` (`user_state`) may or may not be applied; the app degrades to local-only state without it. It is
no longer free to skip, though: `0014` hardens the policies `0009` creates, and if `0009` is applied
**after** `0014`, its own email-only policies come back — so **re-run `0014`** in that case. `0014`
raises a notice saying exactly that when it finds no `user_state` table.

### After applying 0013

1. **Regenerate the types.** `lib/supabase/database.types.ts` carries the new columns
   (`allowed_users.full_name / is_active / created_at / updated_at / updated_by`, `content_versions.op`)
   hand-written in generator format. Run `npm run gen:types` (needs `SUPABASE_PROJECT_ID` and a
   logged-in Supabase CLI) to replace the hand edits with the real schema, then `npm run typecheck`.
2. **Check the seed.** `npm run seed:content` now names `status` explicitly on every table, because
   `0013` changed the column default to `'draft'`. Re-running the seed publishes the shipped content
   and leaves `content_contacts` as drafts, exactly as before.
3. **Run the RLS checks** (next section) — `0013` changes policies and grants.

### After applying 0014

1. **Enable the Custom Access Token hook** and work through
   [SECURITY.md §3](SECURITY.md#3-dashboard-checklist--the-owners-manual-steps). The SQL is inert until
   that switch is on: nothing stamps `app_metadata.role`, so `middleware.ts` sends everyone to
   `/login?error=not_allowed` and every read policy sees a non-member.
2. **Sign in once as an operator and once as a manager** before announcing it. This migration can lock
   every user out if the allow-list is wrong (a mixed-case email is fine now; `is_active = false` is
   not). The Supabase dashboard is a separate login and stays reachable, so turning the hook off there
   is always the way back.
3. **No type regeneration needed.** The `private` schema is not exposed by PostgREST and nothing in the
   app calls its functions, so `lib/supabase/database.types.ts` is unaffected.
4. **Run the RLS checks** (next section).

### After applying 0016

1. **Run the checks on staging**: `supabase/tests/dashboard-parity.sql` (every function against a
   hand-computed table, plus the operator refusal and the grants) and `supabase/tests/retention-checks.sql`
   — see [TESTING.md](TESTING.md#dashboard-parity-and-retention-checks-staging-only).
2. **Decide who schedules retention.** 0016 schedules `watertech-run-retention` (daily, 21:30 UTC = 02:30
   Tashkent) only if pg_cron is already enabled; its last notice says which way it went. Without pg_cron,
   `/api/cron/content-scan` (Vercel Cron, 03:00 UTC) calls `run_retention(p_skip_if_scheduled => true)` after
   its scan, and that call becomes a no-op the day a pg_cron job exists — so enabling pg_cron later
   (Dashboard → Database → Extensions) and **re-running 0016** is all it takes to move the job into the
   database. Job history: `select * from cron.job_run_details order by start_time desc limit 10;`.
3. **Run the first retention pass by hand.** On a project that has never pruned anything the first run can
   delete a large backlog in one transaction, which can outlast the API's statement timeout when the cron
   route calls it. Run `select * from public.run_retention();` once in the SQL editor; every later daily run
   only removes one day's worth.
4. **No type regeneration strictly needed**, but `npm run gen:types` would now also emit the
   `dashboard_*` / `run_retention` entries hand-written in `lib/supabase/database.types.ts` — compare them.

### After applying 0017

1. **Read the notices.** 0017 reports (a) a project with no active manager — add one by hand, nothing
   else can — and (b) legacy mixed-case emails, which `/admin/users` lists but cannot change until
   `update public.allowed_users set email = lower(email) where email <> lower(email);` has run. It also
   warns if the guard/audit functions are not owned by the owner of `access_audit` (run it as `postgres`).
2. **Run `supabase/tests/rls-checks.sql` on staging** — its 0017 blocks assert every refusal by SQLSTATE.
3. **Check `SUPABASE_SERVICE_ROLE_KEY`** is set where the app runs: deactivation bans the account in
   Supabase Auth through the service-role client (docs/SECURITY.md §4).
4. **No type regeneration strictly needed**; `access_audit` and `admin_user_last_activity` are
   hand-written in `lib/supabase/database.types.ts` — compare them with `npm run gen:types` when convenient.

### After applying 0018

1. **Run `supabase/tests/storage-checks.sql` on staging** — bucket settings, the four policies (by behaviour
   and by text), and the `image_path` check.
2. **Upload one photo** from `/admin/products/<id>` and open `/products`: the card must show it, and the
   response for `/_next/image?url=https://<project>.supabase.co/storage/v1/object/public/product-images/…`
   must be 200. A 400 "url parameter is not allowed" means `NEXT_PUBLIC_SUPABASE_URL` at build time does not
   match the project the photo is in (`images.remotePatterns` is derived from it when the build starts).
3. **No type regeneration strictly needed**; `image_path` and the nullable `filename` are hand-edited in
   `lib/supabase/database.types.ts` — compare with `npm run gen:types` when convenient.

### After applying 0020 — Owner steps

0020 is role model v2 (CLAUDE.md §7): the owner's role becomes `admin`, and `manager` means a sales manager,
who gets exactly what an operator gets. The SQL and the app release that knows the three roles go out
**together** — each half alone locks the owner out of the admin panel for the gap:

| State | What the owner sees |
| --- | --- |
| 0020 applied, old release still deployed | Their current token still says `manager`: `/admin` opens, but RLS now treats `manager` as a sales manager, so drafts are invisible and every write answers `unauthorized`. After their next token refresh the claim says `admin`, which the old release does not know: `/login?error=not_allowed`. |
| New release deployed, 0020 not applied | Their token says `manager`, which the new release treats as a sales manager: `/admin` and `/dashboard` send them to `/`. |

Operators are unaffected either way. So, in one sitting:

1. **Check the prerequisites.** Run `supabase/tests/migration-status.sql`: `0014`–`0019` must read `true`.
   0020 aborts with a message naming what is missing otherwise, and also when (a) an `allowed_users` row
   holds a role other than `operator`/`manager`/`admin`, (b) the SQL editor's role impersonation is on, or
   (c) any policy compares the role claim to the literal `'manager'` — after 0020 such a policy would hand a
   sales manager the owner's rows. For (c) the message says which fix applies: when a re-run of `0013` put
   its two pre-0014 policies back (`allowed_users_manager_select_all`, `telemetry_events_manager_select_all`),
   re-run `0014`; for any other such policy (one made by hand on the live tables), it ends with the exact
   `drop policy …;` statements — 0014's `private.is_manager()` policies already cover the owner, so dropping
   them loses nothing.
2. **Apply 0020** in the SQL editor as `postgres`, with role impersonation off. Read the notices: the emails
   converted `manager` → `admin` (today: the owner), and — only if there is no active admin afterwards —
   the exact insert that creates one:
   `insert into public.allowed_users (email, role) values ('owner@gmail.com', 'admin');`
3. **Deploy** the app release with role model v2 right away.
4. **Every admin signs out and back in.** The role claim is stamped when a token is issued, so the new
   `admin` claim arrives with the next sign-in (or, on its own, within the access-token TTL — ≤ 1 h).
5. **Verify.** Sign in as the owner: you land on `/admin`; `/`, `/products` open too (the preview), and the
   avatar menu has "Admin panel". `/admin/users` shows your row with an Admin badge and disabled controls,
   and the add dialog offers Operator and Menejer only. Then run `supabase/tests/rls-checks.sql` and the
   other four check files on **staging**; a sales manager must behave exactly like an operator there.
6. **No type regeneration needed.** Nothing PostgREST exposes changed shape.

Re-running 0020 is safe: it converts rows only on its first application (it records whether
`private.is_admin()` existed before it ran), so a re-run never promotes the sales managers added since.

**Never re-run `0013` on its own after 0020.** Its baseline sections re-create the `allowed_users` and
`telemetry_events` read policies with the literal `'manager'`, which from 0020 on would let every sales
manager read the whole allow-list and all telemetry. If you do re-run it, re-run `0014` straight after —
`rls-checks.sql` fails on any such policy until then, and a re-run of 0020 refuses to proceed.

Admin rows are SQL-editor-only from here on (`WT462` for any write that carries a JWT — `/admin/users`, a
direct PostgREST call, the service-role key). To hand admin to someone else: insert the new admin row
first, then demote or deactivate the old one — the last active admin can never be removed (`WT460`, the SQL
editor included).

### After applying 0021 — Owner steps

0021 adds the reads behind the people directory and person page (R3/S03–S04) and changes no data, table, policy or
grant of an existing object. It re-creates one existing function, `public.dashboard_operator_activity`, so that it
takes its "checklist completed" count from the new shared helper — the numbers stay the same, which
`dashboard-parity.sql` checks.

1. **Check the prerequisites.** `supabase/tests/migration-status.sql`: `0016` and `0020` must read `true`. 0021 aborts
   with a message naming what is missing otherwise.
2. **Apply 0021** in the SQL editor (as `postgres`, like every file). No notice is expected.
3. **Run the checks on staging**: `supabase/tests/people-checks.sql` (every column of the six functions against a
   hand-computed table, their agreement with the 0016 dashboard functions, WT403 for an operator / a sales manager /
   a claim-less token, WT400 for bad arguments, the grants), then `dashboard-parity.sql` and `rls-checks.sql` again —
   the first covers the re-created `dashboard_operator_activity`, the second now sweeps the six new functions too.
   See [TESTING.md](TESTING.md#people-analytics-checks-staging-only-after-0021).
4. **Verify** (the R3 release is the one that calls these functions): `/admin` shows the overview and its compare
   table, `/admin/users` lists every allow-list row with admins as "no telemetry", a person's page
   (`/admin/users/<email>`) shows their numbers, and `/admin/knowledge` shows the same search and feedback numbers as before.
5. **No type regeneration strictly needed**; the six functions are hand-written in `lib/supabase/database.types.ts` —
   compare with `npm run gen:types` when convenient.

Re-running 0021 is safe. So is re-running `0016` after it (e.g. to move retention into pg_cron): that puts back 0016's
own copy of the checklist logic inside `dashboard_operator_activity`, which computes the same thing.

Two definitions the owner should know when reading the numbers (the full list is the header of 0021):
**calls logged** is, per day and daily task, the *last* value typed into DailyTimeline's calls field — the field sends
its whole value on every keystroke, so a sum of the events would count "2" and "25" as 27 calls; and **an admin's
telemetry never counts** (an admin row reads zero, and the UI says "no telemetry"), including what the owner's email
recorded before 0020 while the owner was still `manager`.

### After applying 0022 — Owner steps

0022 lets `/admin/users` remove an operator or a sales manager (CLAUDE.md §7, SECURITY.md §5): the admin's session
may now DELETE an allow-list row — the guard trigger decides which (never an admin row, never their own, never the
last admin) and the audit trigger records it — and `admin_purge_person_history` deletes one person's activity
history. It changes no data.

1. **Check the prerequisites.** `supabase/tests/migration-status.sql`: `0020` must read `true` (and `0021`, by
   order). 0022 aborts with a message naming what is missing otherwise — also when 0017 was re-run after 0020
   (the guard body is 0017's again: re-run 0020 first) and when the SQL editor's role impersonation is on.
2. **Apply 0022** in the SQL editor as `postgres`, role impersonation off. One notice is normal on the first run
   (`policy "allowed_users_admin_delete" … does not exist, skipping`). An error saying the function "runs as …,
   which RLS would narrow on" means the file was run as a role that does not own `telemetry_events`,
   `user_state`, `copilot_logs` or `allowed_users` and has no BYPASSRLS: run it as `postgres`.
3. **Verify** (read-only, safe anywhere):

   ```sql
   -- the grant, the one delete policy, the function's shape and grants
   select has_table_privilege('authenticated', 'public.allowed_users', 'DELETE') as delete_granted;
   select policyname, cmd, roles, qual from pg_policies
    where schemaname = 'public' and tablename = 'allowed_users' and cmd in ('DELETE', 'ALL');
   -- expect one row: allowed_users_admin_delete | DELETE | {authenticated} | (SELECT private.is_admin() …)
   select p.prosecdef, p.proconfig,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
          has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
     from pg_proc p where p.oid = 'public.admin_purge_person_history(text)'::regprocedure;
   -- expect: true | {search_path=""} | true | false | false
   ```

4. **Run the checks on staging**: `supabase/tests/rls-checks.sql` (operators and sales managers delete nothing and
   cannot call the purge; the admin removes an operator row and a sales-manager row, audited; admin rows `WT462`,
   the own row `WT461`, the last admin `WT460`; stale tokens `WT403`; the purge's counts and refusals) and
   `supabase/tests/people-checks.sql` (the purge against its fixture). Never on production.
5. **Deploy the release** with the remove action, then remove somebody who left — card ⋯ menu, table row or the
   danger zone on their page. `select * from public.access_audit where action = 'delete' order by created_at desc
   limit 5;` shows the removal; Authentication → Users no longer lists their account.
6. **No type regeneration strictly needed**; `admin_purge_person_history` is hand-written in
   `lib/supabase/database.types.ts` — compare with `npm run gen:types` when convenient.

Re-running 0022 is safe. **Re-running 0017 after it revokes the DELETE grant again** (0017 starts with `revoke all
… from authenticated`): re-run 0022 straight after — removals answer `unauthorized` until then, and
`rls-checks.sql` says "was 0017 re-run after it?".

### After applying 0023 — Owner steps

0023 adds the attestation's storage and its security boundary ([ATTESTATION.md](ATTESTATION.md) §12–§13,
SECURITY.md §7): six tables nobody but the admin can read, five admin functions, the purge extended, a retention
function, and one settings row with the defaults. It changes no existing data.

1. **Check the prerequisites.** `supabase/tests/migration-status.sql`: `0022` must read `true`. 0023 aborts with a
   message naming what is missing otherwise, and when the SQL editor's role impersonation is on.
2. **Apply 0023** in the SQL editor as `postgres`, role impersonation off. Normal notices: `… does not exist,
   skipping` on the first run (policies and triggers are dropped before they are created), and one of
   `0023: pg_cron job watertech-run-assessment-retention scheduled daily at 21:35 UTC.` or
   `0023: pg_cron is not enabled — /api/cron/content-scan runs public.run_assessment_retention() …`. An error saying
   a function "runs as …, which RLS would narrow on" means the file was run as a role that does not own the tables:
   run it as `postgres`.
3. **Verify** (read-only, safe anywhere):

   ```sql
   -- six tables, RLS on, each with its restrictive admin-only policy
   select c.relname, c.relrowsecurity,
          (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname
             and p.permissive = 'RESTRICTIVE') as restrictive
     from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname like 'assessment\_%' and c.relkind = 'r'
    order by 1;
   -- expect 6 rows: true | 1
   select id, retention_days, thresholds, version from public.assessment_config;
   -- expect: 1 | 365 | {"green": 80, "yellow": 60} | 1
   select p.proname, p.prosecdef, p.proconfig = array['search_path=""'] as empty_search_path,
          has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated,
          has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role
     from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and (p.proname like 'admin\_assessment\_%' or p.proname = 'run_assessment_retention')
    order by 1;
   -- expect the five admin_assessment_* functions: true | true | true | false,
   -- and run_assessment_retention: true | true | false | true
   ```

4. **Run the checks on staging**: `supabase/tests/attestation-checks.sql`, then `rls-checks.sql` (the five functions
   refuse an operator and a sales manager with `WT403`) and `people-checks.sql` (the purge, now with attestation
   rows). Never on production.
5. **Deploy the release.** "Attestatsiya" appears in the admin nav under Monitoring. `/admin/assessments` shows
   "Hali topshirilgan attestatsiya yo'q"; the settings show the defaults (40/60 for days 1–3, 20/80 for day 4;
   green 80, yellow 60; 365 days); the item bank is empty. Review the settings and add the factory facts.
6. **Staging only — seed the bank**: `npm run seed:content -- --dry-run`, then `npm run seed:content` (its guard
   refuses production). It adds 32 draft items, eight per day; read them in `/admin/assessments/items`, publish what
   is right, and add items or lower each day's item count in the settings — a day cannot start (S05) until its bank
   has as many published items as it draws. On production the admin writes the bank in the UI.
7. **No type regeneration strictly needed**; the 0023 tables and functions are hand-written in
   `lib/supabase/database.types.ts` — compare with `npm run gen:types` when convenient.

Re-running 0023 is safe (the settings row is kept as the admin saved it). **Re-running 0022 after it puts back the
purge without the attestation tables** — a removal "with history" would then leave the person's attempts behind:
re-run 0023 straight after (`attestation-checks.sql` says "was 0022 re-run after 0023?").

### Retention policy (0016)

`public.run_retention()` is the only place the numbers live (its `constant` declarations); this table
describes them.

| Table | Rule |
| --- | --- |
| `telemetry_events` | rows older than 180 days are deleted |
| `copilot_logs` | `question` is set to null after 30 days; the row is deleted after 90 days |
| `content_gate_reports` | rows older than 180 days are deleted |
| `admin_notifications` | **read** notifications created more than 90 days ago are deleted; unread ones are kept |
| `content_versions` | the newest 50 `op = 'update'` snapshots per `(table_name, row_id)` are kept; `op = 'delete'` snapshots (what `/admin/trash` restores from) are kept 180 days |

The dashboard's longest range (93 days, `MAX_RANGE_SPAN_DAYS` in `lib/dashboard/range.ts`) compares against the 93
days before it, 186 days in total — so at that one range the previous window's oldest ~6 days are already
pruned and the KPI deltas lean positive. Every shorter range is unaffected.

The attestation (0023) has its own function, `public.run_assessment_retention()`: attempts started more than
`assessment_config.retention_days` ago (default 365, 30–3650, set in `/admin/assessments/settings`) are deleted with
their conversations, and unlocks older than the same window. `assessment_audit` has no retention. Its pg_cron job
(21:35 UTC) runs five minutes after 0016's; without pg_cron the cron route calls it after `run_retention()`, each
whether or not the other failed.

## Running `rls-checks.sql` on staging

`supabase/tests/rls-checks.sql` is the verification step for anything that touches a policy, a `GRANT`
or a write-side trigger. **Staging only, never production**: it inserts fixture rows, and although the
whole script ends in `ROLLBACK`, it holds locks on live tables while it runs and consumes `bigserial`
ids that are not given back.

1. Supabase Dashboard → **staging** project → SQL Editor → New query.
2. Paste the whole file. Run it once.
3. Pass: a single row, `RLS checks passed`. Fail: an error starting with `RLS FAIL:` that names the
   role and the table.

What it asserts about `0013` specifically:

- a manager cannot insert a fabricated `content_versions` row (policy dropped, `INSERT` revoked), nor
  update or delete an existing one (`UPDATE`/`DELETE` revoked);
- a content row inserted without a `status` lands as `'draft'`;
- `updated_by` is taken from the JWT even when the payload sends a different email, on insert and on
  update;
- deleting a row writes a snapshot with `op = 'delete'`, including the `content_packages` row deleted
  by the `on delete cascade` from its group.

What it asserts about `0014` specifically:

- the access-token hook stamps the role for an active `allowed_users` row, matching the email
  case-insensitively, and returns `{"error":{"http_code":403,"message":"not_allowed"}}` for an unknown
  email, an `is_active = false` row, and claims with no email at all;
- three non-member identities — `role: "none"`, a token with no `app_metadata`, and a deactivated user —
  see **zero rows in every table, published content included**, and cannot insert into `user_state`;
- an operator still reads published content and their own `user_state`; a manager still reads drafts and
  every dashboard table, `allowed_users` included.

What it asserts about `0017` specifically:

- an operator cannot insert, promote (themselves included), deactivate or delete an `allowed_users` row —
  including an unfiltered `UPDATE`, which only the update policy can stop — nor call
  `admin_user_last_activity()`;
- a manager can add a row and re-role another, both stamped with their JWT email and audited; a no-op
  update writes no audit row; `email`, `created_at`, `updated_at` and `updated_by` are not updatable, and
  nothing is deletable;
- a manager may rename but not demote or deactivate their own row (`WT461`), and the last active manager
  cannot be demoted (`WT460`) — through a manager session, and through `service_role`/the SQL editor too,
  single-row and whole-table;
- a manager token whose row was demoted or deactivated can no longer write the allow-list (`WT403`);
- `access_audit` is readable by managers only, writable by nobody (its owner included), and the grant
  matrix of both tables matches 0017.

What it asserts about `0020` specifically:

- a `manager` JWT (a sales manager) gets exactly what an operator gets — published content and its own
  `user_state`; no drafts, no content writes, none of the admin tables, and `WT403` from every
  `dashboard_*` / `copilot_*` / `admin_*` function and `reorder_content_rows()`; `private.is_manager()`
  answers false for it;
- an `admin` JWT keeps everything the pre-0020 manager had, and the hook stamps `admin` / `manager` rows
  verbatim;
- admin rows are SQL-editor-only: through the API — the admin's own session or the service-role key —
  creating, promoting to, demoting, deactivating, reactivating, deleting or re-addressing one is `WT462`,
  while the SQL editor can add and remove one; the last active admin cannot be demoted, deactivated or
  deleted from anywhere (`WT460`, checked before `WT461` and `WT462`);
- no policy compares the role claim to a literal, and the four `private` helpers are executable by
  `authenticated` only.

What it asserts about `0022` specifically:

- an operator's and a sales manager's DELETE on `allowed_users` — an admin's row, another member's, their own, and
  unfiltered — removes nothing and never reaches the guard (the admin-only policy hides every row), and both get
  `WT403` from `admin_purge_person_history()`;
- the admin removes an operator row and a sales-manager row, each audited (`action = 'delete'`, the row as
  `before`, the admin as `actor`); another admin's row (active or not) is `WT462`, the admin's own `WT461`, the
  last active admin's own `WT460`; a stale admin token (demoted, deactivated) gets `WT403` for a delete and a
  purge, and an admin row whose token still says operator deletes nothing and cannot purge;
- the purge deletes exactly the one person's telemetry / user_state / copilot_logs rows (argument normalised),
  leaves `access_audit` alone, answers zeros on a repeat, and refuses self / admin rows / an empty email; the
  admin's own session cannot delete those rows directly;
- exactly one DELETE policy on `allowed_users`, the purge is SECURITY DEFINER with `search_path = ''`, and only
  `authenticated` may execute it.

A failure of the `0013` block on a project where `0013` has not been applied means "apply 0013", not
"the policies are wrong"; the `0014` blocks fail the same way with "is 0014 applied?", and a missing
`0017`, `0020` or `0022` stops the file early with "apply 0017_user_admin_and_access_audit.sql" (or the file
named).
`permission denied … missing GRANT` anywhere means a table is missing its `GRANT … to authenticated`
(the lesson of `0003`).

## Rollback

There is no down-migration mechanism; a rollback is a new numbered file. `0013` is written so that
each section can be reverted independently — the statements below are what to put in that file, not
something to keep in `0013` itself.

**Section 1 — `allowed_users`.** Do not drop the table; it holds the allow-list. To undo only the new
columns: `alter table public.allowed_users drop column if exists full_name, drop column if exists
is_active, drop column if exists created_at, drop column if exists updated_at, drop column if exists
updated_by;` and
`alter table public.allowed_users drop constraint if exists allowed_users_email_lowercase_chk,
drop constraint if exists allowed_users_role_chk;`. The two policies are the ones `0001` and `0005`
already define, so leave them alone. Re-granting write access to `authenticated` is not a rollback
anyone should want.

**Section 2 — `telemetry_events`.** The table pre-dates the migration, so rolling back means dropping
only what `0013` added: `drop index if exists public.telemetry_events_ts_idx, public.telemetry_events_user_email_ts_idx, public.telemetry_events_type_ts_idx;`.
Dropping the table would destroy the dashboard's history — never do that as a rollback. (Once `0016` is
applied, `_ts_idx` and `_type_ts_idx` no longer exist: `0016` replaced them with `_ts_cover_idx` and
`_type_ts_cover_idx` on the same key columns.)

**Section 3 — trigger functions.** Restore the `0002` body of `snapshot_content_version()` (plain
`language plpgsql`, no `security definer`, `BEFORE UPDATE` behaviour only) and
`drop function if exists public.stamp_content_actor();` *after* dropping its triggers (section 4).
Restoring the old function means `authenticated` needs `INSERT` on `content_versions` again, so
section 6 has to be rolled back with it.

**Section 4 — `status` default.** `alter table public.<t> alter column status set default 'published';`
for each of the 10 tables. Nothing to migrate: the default only affects future inserts.

**Section 4 — triggers.** `drop trigger if exists trg_stamp_content_actor on public.<t>;` and
`drop trigger if exists trg_snapshot_version_delete on public.<t>;` for each of the 10 tables. Rows
already written keep their stamped `updated_by`, and delete snapshots already taken stay in
`content_versions` (harmless history).

**Section 4 — `content_versions.op`.** `alter table public.content_versions drop column if exists op;`
after the delete triggers are gone — the column is `not null`, so the trigger must not still be
inserting into it. Existing rows are not otherwise affected.

**Section 4 — `content_versions` lockdown.** `grant insert on table public.content_versions to
authenticated;`, `grant usage, select on sequence public.content_versions_id_seq to authenticated;`
and re-create `content_versions_manager_insert` from `0002`. Only needed if the `SECURITY DEFINER`
snapshot function is rolled back too — with it in place, nothing in the app uses these privileges.

### Rolling back 0014

Don't, unless the hook is locking out legitimate users — and in that case **turn the hook off in
Authentication → Hooks first**. That is instant, reversible, and restores sign-in without touching the
schema; it leaves the RLS half of `0014` in place, which is the half that closed the data leak. Fixing
the `allowed_users` row (lowercase email, `is_active = true`, `role` set) is almost always the real
remedy.

If the SQL itself has to go back, a new numbered file re-creates the `0002`/`0010`–`0012` read policies
(`<t>_authenticated_select_published` + `<t>_manager_select_all`), the `0009` `user_state` policies and
the `0001` hook body, then `drop schema private cascade;` last — the policies reference its functions,
so dropping it first fails. **Doing this re-opens the P0 in `docs/SECURITY.md` §2.** Reverting only the
hook, and keeping the role-gated policies, is the safe partial rollback: restore the `0001` body and
nothing else.

### Rolling back 0016

Nothing in 0016 changes or deletes data by itself — only `run_retention()` does, when something calls it.
To stop pruning immediately: `select cron.unschedule('watertech-run-retention');` (if the job exists) and
`revoke execute on function public.run_retention(boolean) from service_role;` (the cron route then logs
`retention_failed` after each scan). Rows already pruned are gone; there is no undo for retention.

A full rollback file drops the ten functions (`public.dashboard_kpis`, `_operator_activity`, `_hourly`,
`_zero_result_searches`, `_web_vitals`, `_not_helpful`, `_most_viewed`, `public.run_retention`,
`private.dashboard_active_ms`, `private.dashboard_zero_result_events`) and re-creates the two 0013 indexes
(`create index telemetry_events_ts_idx on public.telemetry_events (ts);`,
`create index telemetry_events_type_ts_idx on public.telemetry_events (type, ts);`) before dropping the
`_cover_` pair. The dashboard code of S09 cannot run without the functions, so it goes back together
with the app release that preceded it. With 0021 applied, roll it back first — fully (below): its functions
call 0016's helpers.

### After applying 0019

1. **Run `supabase/tests/copilot-checks.sql` on staging** — counts, rates and percentiles against a hand-computed
   table, the normalization corpus, the manager-only refusals (WT403), argument errors (WT400) and the grants.
2. **Open `/admin/knowledge#copilot`.** The Copilot card and the Copilot half of "Topilmagan savollar" must render;
   a range older than 30 days lists no questions from before the cut-off, by design — `run_retention()` (0016) nulls the question text after 30 days.
3. **No type regeneration strictly needed**; `copilot_stats` and `copilot_unanswered` are hand-written in
   `lib/supabase/database.types.ts` — compare with `npm run gen:types` when convenient.

### Rolling back 0018

Photos already uploaded are the only data 0018 enables; decide about them first. To stop uploads without
losing any: `drop policy if exists "product_images_manager_insert" on storage.objects;` and the same for
`"product_images_manager_update"` — the admin upload then answers `unauthorized`, and every existing photo
keeps rendering. A full rollback file also drops `"product_images_manager_select"` and
`"product_images_manager_delete"`, runs `update public.content_products set image_path = null;` (the catalog
falls back to `/products/<filename>`, or to its "no image" placeholder for products that never had a file),
drops the `content_products_image_path_shape` constraint and the column, and deletes the bucket from the
dashboard (Storage → product-images → Delete — it must be emptied first). `filename` can only become
`not null` again once every row has one: `select id from public.content_products where filename is null;`
lists the rows to fix or delete first.

### Rolling back 0017

To take write access away again without losing anything: `drop policy if exists
"allowed_users_manager_insert" on public.allowed_users;`, the same for `"allowed_users_manager_update"`,
then `revoke insert, update on table public.allowed_users from authenticated;`. `/admin/users` then answers
`unauthorized` for every change and the allow-list goes back to being edited in the SQL editor. Leave the
guard and audit triggers in place: they cost nothing and keep auditing the SQL editor.

A full rollback file also drops the four triggers on `allowed_users` (`trg_allowed_users_guard`,
`trg_set_updated_at`, `trg_stamp_actor`, `trg_allowed_users_audit`), the functions
`private.allowed_users_guard()`, `private.audit_allowed_users()`, `public.admin_user_last_activity()`, and
finally `private.access_audit_append_only()` with the table it protects. **Keep `public.access_audit`**
unless the history is truly unwanted — it is the only record of who changed the allow-list. `anon`'s
revoked privileges are not worth restoring.

### Rolling back 0020

With 0022 applied, roll it back first ([below](#rolling-back-0022)): its delete policy calls
`private.is_admin()`, which step 3 drops, and Postgres refuses to drop a function a policy depends on.

Roll the app release back with it — the pre-0020 release does not know the `admin` claim. The pre-0020
model has no sales-manager role, so every `manager` row must stop being one **before** `manager` means the
owner again; otherwise each sales manager would come back with full CMS access. Three runs, in this order
(each is one transaction; verified on PGlite — after them the pre-0020 check files all pass again):

1. Sales managers become operators, under 0020's guard (no admin row is touched):

   ```sql
   update public.allowed_users set role = 'operator' where role = 'manager';
   ```

2. **Re-run `0017_user_admin_and_access_audit.sql`.** It restores the guard that counts managers, and is
   idempotent otherwise. This must come before step 3: 0020's guard refuses to demote the last admin even
   from the SQL editor (`WT460`).

3. The owner goes back to `manager`, and the three helpers and the CHECK to their 0014 / 0013 shape:

   ```sql
   begin;
   update public.allowed_users set role = 'manager' where role = 'admin';
   create or replace function private.is_manager()
   returns boolean language sql stable security invoker set search_path = ''
   as $$ select private.app_role() = 'manager'; $$;
   create or replace function private.is_member()
   returns boolean language sql stable security invoker set search_path = ''
   as $$ select private.app_role() in ('operator', 'manager'); $$;
   drop function if exists private.is_admin();
   alter table public.allowed_users drop constraint if exists allowed_users_role_chk;
   alter table public.allowed_users add constraint allowed_users_role_chk check (role in ('operator', 'manager'));
   commit;
   ```

Then deploy the previous release, and everyone signs out and back in. `access_audit` keeps a row for every
change above, like for any other allow-list write.

### Rolling back 0019

Nothing is stored: the three functions are the whole migration. `drop function public.copilot_stats(timestamptz,
timestamptz); drop function public.copilot_unanswered(timestamptz, timestamptz, integer); drop function
private.copilot_normalize_question(text);` removes it, and `/admin/knowledge#copilot` then shows its widgets' error state
until the app release that added the tab is rolled back with it.

### Rolling back 0021

Nothing is stored: functions are the whole migration. Roll the S03/S04 app release back with it — the people pages
call these functions. Verified on PGlite: after either level, the other five check files pass.

**Partial** (enough in practice) — drop what only the people pages use, one transaction:

```sql
begin;
drop function if exists public.admin_people_overview(timestamptz, timestamptz);
drop function if exists public.admin_person_summary(text, timestamptz, timestamptz, timestamptz);
drop function if exists public.admin_person_daily(text, timestamptz, timestamptz);
drop function if exists public.admin_person_sections(text, timestamptz, timestamptz);
drop function if exists public.admin_person_recent_events(text, integer);
drop function if exists public.admin_top_content(timestamptz, timestamptz, integer);
drop function if exists private.people_activity(timestamptz, timestamptz, text[]);
drop function if exists private.people_daily_active_ms(timestamptz, timestamptz, text[]);
drop function if exists private.people_window_days(timestamptz, timestamptz);
drop function if exists private.people_tracked_emails(text);
drop function if exists private.people_check_window(text, timestamptz, timestamptz);
drop function if exists private.people_check_email(text, text);
drop function if exists private.people_check_limit(text, integer);
notify pgrst, 'reload schema';
commit;
```

`private.dashboard_checklist_completed` and 0021's version of `dashboard_operator_activity` stay: they compute
what 0016's did.

**Full** — after the partial step, **re-run `0016_dashboard_rpc_and_retention.sql`** (it puts back its own
`dashboard_operator_activity`, with the checklist logic inline; the rest of the file is idempotent), and only then
`drop function if exists private.dashboard_checklist_completed(timestamptz, timestamptz, text);` — in that order: a
plpgsql body is not checked at drop time, so dropping the helper first would leave the dashboard's Faollik tab
failing at run time.

### Rolling back 0022

Nothing is stored by 0022 itself — but what it made possible is not undoable: removed allow-list rows, deleted
Supabase Auth accounts and purged history stay gone (`access_audit` still records each removal). Roll the release
with the remove action back with it; without the grant, a removal answers `unauthorized` after deleting the Auth
account. One transaction (verified on PGlite — after it the pre-0022 `rls-checks.sql` and `people-checks.sql`
pass):

```sql
begin;
drop function if exists public.admin_purge_person_history(text);
drop policy if exists "allowed_users_admin_delete" on public.allowed_users;
revoke delete on table public.allowed_users from authenticated;
notify pgrst, 'reload schema';
commit;
```

The guard and audit triggers stay as they are: they already covered deletes, from the SQL editor too.

### Rolling back 0023

**This deletes data**: every attempt, conversation, unlock, bank item, the settings and the attestation audit. Export
what should be kept first (Table Editor → export, or `copy … to stdout`). Roll back the release with the
"Attestatsiya" pages with it, and roll 0023 back **before** 0022 if both go (0022's rollback drops the purge function
0023 re-created). One transaction, then re-run 0022 — verified on PostgreSQL 16: afterwards the pre-0023
`rls-checks.sql`, `people-checks.sql` and `retention-checks.sql` pass, and `migration-status.sql` reads `0023` false.

```sql
begin;
do $$
begin
  -- Dynamic: cron.job exists only where pg_cron is enabled.
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(j.jobid) from cron.job j where j.jobname = 'watertech-run-assessment-retention';
  end if;
end $$;
drop function if exists public.run_assessment_retention(boolean);
drop function if exists public.admin_assessment_override(uuid, numeric, text, integer);
drop function if exists public.admin_assessment_clear_override(uuid, text, integer);
drop function if exists public.admin_assessment_reset(uuid, integer);
drop function if exists public.admin_assessment_reset_person(text);
drop function if exists public.admin_assessment_unlock(text, smallint);
drop table if exists
  public.assessment_messages, public.assessment_attempts, public.assessment_unlocks,
  public.assessment_items, public.assessment_config, public.assessment_audit;
drop function if exists private.assessment_admin_actor(text);
drop function if exists private.audit_assessment_items();
drop function if exists private.audit_assessment_config();
drop function if exists private.assessment_bump_version();
drop function if exists private.assessment_append_only();
drop function if exists private.assessment_item_publishable(text, text, text, jsonb, text[], text, text);
drop function if exists private.assessment_answer_key_valid(jsonb, text[]);
drop function if exists private.assessment_options_valid(jsonb);
drop function if exists private.assessment_day_settings_valid(jsonb);
drop function if exists private.assessment_thresholds_valid(jsonb);
drop function if exists private.assessment_weights_valid(jsonb);
drop function if exists private.assessment_json_keys_are(jsonb, text[]);
drop function if exists private.assessment_json_int_between(jsonb, integer, integer);
notify pgrst, 'reload schema';
commit;
```

Then **re-run `0022_person_removal.sql`**: it puts back its own `admin_purge_person_history` — the 0023 body still
names the dropped tables, and a plpgsql body is not checked at drop time, so without the re-run every removal "with
history" would fail at run time.

