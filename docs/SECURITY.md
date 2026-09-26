# Security — the auth model

Who can reach this app, what decides that, and which of those decisions live in the Supabase dashboard
rather than in this repository.

Scope: authentication and authorization. Content integrity (the publish gate, the append-only version
history, `updated_by`) is in [MIGRATIONS.md](MIGRATIONS.md); the verification script is in
[TESTING.md](TESTING.md).

## 1. The model in one paragraph

There are exactly two ways to hold data from this project: a session belonging to an **active row in
`public.allowed_users`**, or the **service-role key**, which lives only on the server. Google decides
*who you are*; `allowed_users` decides *whether a token is issued at all*; `middleware.ts` decides
*which routes* that token opens; RLS decides *which rows*. No layer trusts a client-supplied identity —
not an email in a request body, not a role in a payload.

### Role model v2 (migration 0020)

| Role | Who | Operator app (`/`, `(app)/**`) | Admin panel (`/admin/**`, `/dashboard/**`) | Telemetry |
| --- | --- | --- | --- | --- |
| `admin` | the owner | yes — a preview | **yes, everything** | never recorded |
| `manager` | a sales manager | yes (the operator's UI, for now) | **no** → sent to `/` | recorded |
| `operator` | an operator | yes | **no** → sent to `/` | recorded |

The admin panel refuses an operator and a sales manager at **every layer on its own**: `middleware.ts`
(`isAdminArea()` → `homeForRole()`), the page gate (`requireAdminPage()` in both admin layouts — `/admin` and
`/dashboard`, so the shell never renders for them — and again in every `/dashboard` page and on the people pages),
the Server Action guard (`requireAdminSession()`), and the database (RLS through
`private.is_admin()`, and a `WT403` from every admin function). **Admin rows are SQL-editor-only**: the
allow-list guard refuses any write that carries a JWT and creates, promotes, demotes, deactivates,
reactivates, deletes or re-addresses an admin row (`WT462`), so `/admin/users` assigns `operator` and
`manager` only, and removes only those rows (0022, §5). An admin's session records no telemetry — the client tracker sends nothing until the role is
known and nothing for an admin after (`lib/telemetry/client.ts`), and `/api/events` answers `204` without
inserting.

## 2. Sign-in, end to end

| # | Step | Where | What it decides |
| --- | --- | --- | --- |
| 1 | `signInWithOAuth({ provider: "google", redirectTo: "<origin>/auth/callback?locale=…" })` | [GoogleSignInButton.tsx](../app/[locale]/login/GoogleSignInButton.tsx) | Starts the PKCE flow. Top-level `window.location` redirect, so the CSP's `frame-ancestors 'none'` / `form-action 'self'` do not block it. |
| 2 | Google authenticates the person | accounts.google.com | Identity only. Any Google account can get this far. |
| 3 | Google → `https://<ref>.supabase.co/auth/v1/callback` → back to `<origin>/auth/callback?code=…&locale=…` | Supabase Auth | The `code` is single-use and bound to the PKCE verifier in the browser. |
| 4 | `exchangeCodeForSession(code)` | [app/auth/callback/route.ts](../app/auth/callback/route.ts) | **The gate.** GoTrue mints the access token here, and minting runs the hook in step 5. |
| 5 | `public.custom_access_token_hook(event)` | [0014_role_gated_rls.sql](../supabase/migrations/0014_role_gated_rls.sql) | Active `allowed_users` row → stamps `app_metadata.role` = `operator` \| `manager` \| `admin`, verbatim from the row. Otherwise returns the Auth Hooks error response and **no token exists**. |
| 6 | Route gating | [middleware.ts](../middleware.ts) | Reads the role off the locally verified JWT. The admin panel (`/admin`, `/dashboard`) is the admin's alone: an operator or a sales manager is sent to `/`. One-directional — the admin may open the operator routes too (a preview). Network-free (CLAUDE.md §4). It runs on every path except `api/*`, `auth/callback`, the Sentry tunnel, `_next/*`, the three `public/` asset folders and three exact files (CLAUDE.md §7) — until Audit-2 any path ending in `.json`, `.png`, `.map`… skipped it (AUDIT.md F1). |
| 7 | Row gating | RLS, via `private.is_member()` / `private.is_admin()` (`is_manager()` is its deprecated alias since 0020) | Which rows that session sees, per table. |

`/login` and `/offline` are the only public paths. `/offline` is public because the service worker
precaches it without necessarily sending the session cookie; it holds no user data.

### Why step 5 is the gate, not step 4

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is in the browser bundle — that is what it is for, and it cannot be
kept secret. So anyone can drive steps 1–4 against the Auth API directly, without ever loading this
app.

Before migration 0014 the hook stamped `role = 'none'` for an unknown email and the callback route
called `signOut()` afterwards. That was too late: the JWT had already been signed, and a client that
kept it could present it to PostgREST, where every content read policy checked only
`status = 'published'`. Since 0014 the hook returns

```json
{ "error": { "http_code": 403, "message": "not_allowed" } }
```

which GoTrue propagates verbatim as an HTTP 403 without issuing a token. Postgres hook errors are not
retried. The callback route logs that refusal on its own line (status and code only — never the
account) and shows the same `/login?error=not_allowed` page as every other failure, so the browser
learns nothing about *why*.

### What the role claim means to the database

`private.app_role()`, `private.is_member()`, `private.is_admin()` and its deprecated alias
`private.is_manager()` (schema `private`, not exposed by PostgREST, `USAGE` granted to `authenticated`
alone) are the only readers of the claim. Because step 5 refuses everyone else, `is_member()` is a
sufficient membership test — the database does not re-read `allowed_users` per request, and does not need
to. The one exception is the allow-list guard, which reads the caller's current row before any
allow-list write (`WT403` for a stale admin token).

Per table, since 0014 (the `admin` column is what the `manager` column said before 0020; the 0014–0019
policies still call `private.is_manager()` by name, which is `private.is_admin()` under its old name):

| Table(s) | `operator` / `manager` (sales manager) | `admin` | anyone else |
| --- | --- | --- | --- |
| the 10 `content_*` tables | published rows | every row, plus insert/update/delete | nothing |
| `user_state` | own rows, read + write | own rows read + write; every row, read only | nothing, and no insert |
| `content_versions`, `copilot_logs`, `admin_notifications`, `content_gate_reports`, `telemetry_events` | nothing | read (plus the `read_at` flip on `admin_notifications`) | nothing |
| `allowed_users` (since 0017) | nothing | read; insert; update of `role`, `is_active`, `full_name` only — never an admin row's role or status (SQL editor only, 0020), never its own role/status, never the last active admin, and only while its own row is still an active admin; delete (since 0022) of an operator's or sales manager's row only — never an admin row, never its own, never the last active admin | nothing |
| `access_audit` (0017) | nothing | read — nobody writes it but the trigger, `service_role` included | nothing |
| `rate_limits` | nothing | nothing | nothing — `service_role` only, through `rate_limit_hit()` |
| `storage.objects`, bucket `product-images` (0018) | nothing through RLS | read, insert, update, delete — writes only under `products/` | nothing through RLS |
| `assessment_config`, `assessment_items` (0023) | nothing | read; update (config) / insert, update, delete (items), version-guarded, every write audited by trigger | nothing |
| `assessment_attempts`, `assessment_messages`, `assessment_unlocks`, `assessment_audit` (0023) | nothing — not even their own attempt (§7) | read; writes only through the five `admin_assessment_*` functions | nothing |

The `dashboard_*` (0016), `copilot_*` (0019) and `admin_user_last_activity()` (0017) functions,
`reorder_content_rows()` (0015) and the people analytics functions `admin_people_overview`,
`admin_person_summary` / `_daily` / `_sections` / `_recent_events` and `admin_top_content` (0021) start with
the same check and raise `WT403` for an operator and a sales manager — an explicit refusal, not a
zero-filled answer.

`admin_purge_person_history(p_email)` (0022) is the one way a session deletes somebody's
`telemetry_events`, `user_state` or `copilot_logs` rows: no session role holds a DELETE policy on those
tables (and `telemetry_events` no DELETE grant), so the function is `SECURITY DEFINER`. It starts with the
same `WT403` check, then — like the allow-list guard, under the guard's advisory lock — reads the caller's
own row (`WT403` unless it is an active admin), and refuses the caller's own email (`WT461`) and an admin
row's (`WT462`). `EXECUTE` is `authenticated`'s alone. Since 0023 it also deletes the person's attestation
attempts (their conversations cascade) and unlocks.

The attestation's admin writes on attempts and unlocks — `admin_assessment_override`, `_clear_override`,
`_reset`, `_reset_person` and `_unlock` (0023) — are `SECURITY DEFINER` for the same reason: no session role
holds a write privilege on those tables or on `assessment_audit`, so a score cannot be rewritten, nor an audit
row forged, straight over PostgREST. Each starts with the `WT403` check and re-reads the caller's row under
the guard's lock, then writes one audit row. The threat model is §7.

**The `product-images` bucket is public on purpose.** Catalog photos are marketing material, so anyone
holding a photo's URL can fetch it from `/storage/v1/object/public/product-images/…` — Storage serves
public buckets without consulting RLS. What stays closed is everything else: no role but the admin can
list, upload, replace or remove an object, and the policies are scoped to this bucket alone. Uploads go
through `lib/admin/actions/product-image.ts` with the admin's own session client (never the service
role), which checks the file's magic bytes against its declared type and extension, stores it under a
content-addressed key (`products/<id>/<sha256-8>.<ext>`), and never accepts SVG. The bucket enforces
the same 2 MB / JPEG-PNG-WebP-AVIF limits again. `img-src` allows only this bucket's public path, and
the image optimizer (`images.remotePatterns`) fetches nothing else from the Supabase host.

No policy anywhere targets `anon`. `rate_limits` (0008), `allowed_users` and `access_audit` (0017)
revoke every `anon` privilege; on the other public tables `anon` keeps whatever the project's default
privileges gave it — on a fresh Supabase project, all of them. That is inert: RLS is enabled on every
table and no policy names `anon`, so an anon-key request sees and changes nothing, and the privileges RLS
does not cover (TRUNCATE, TRIGGER, REFERENCES) are not reachable through PostgREST, GraphQL or Realtime.
Revoking them anyway is open item O1 in [AUDIT.md](AUDIT.md#b-findings-of-this-audit). Writes that need to bypass
RLS (telemetry ingestion, the copilot log, the publish gate, the content loaders — and, since 0017, the
Supabase Auth ban/unban behind `/admin/users`, and since 0022 deleting a removed person's Auth account —
neither has a session-scoped equivalent — and, from S05, a candidate's own attestation attempt, §7) go through
[lib/supabase/admin.ts](../lib/supabase/admin.ts) in server code only, and take the email from the
verified session, never from the payload.

## 3. Dashboard checklist — the owner's manual steps

None of this is in the repository, and the migration cannot do it. **Step 1 is what makes the P0 fix
take effect: without it the hook never runs and no role is ever stamped.**

- [ ] **1. Enable the hook.** Authentication → Hooks → *Customize Access Token (JWT) Claims* → enable,
      type *Postgres*, schema `public`, function `custom_access_token_hook`. The migration has already
      granted `EXECUTE` to `supabase_auth_admin` and left the `allowed_users` read policy for it in
      place. Verify by signing in and decoding the access token: `app_metadata.role` must be present.
      *Fail mode to know about:* if the hook is enabled but the function is broken, nobody can sign in.
      The Supabase dashboard is a separate login and stays reachable, so disabling the hook there is
      always the way out.
- [ ] **2. Decide "Allow new users to sign up."** Authentication → Sign In / Providers.
      **On** (Supabase default): an unknown Google account still creates an `auth.users` row — the hook
      runs at token issuance, after the user record is matched or created — and then gets the 403. It
      never holds a session or a role, and no policy grants it anything, but expect rejected accounts
      to accumulate under Authentication → Users. **Off:** an unknown account is refused earlier, by
      GoTrue itself, and nothing is created; the cost is that adding a colleague then takes two steps —
      an `allowed_users` row *and* an invite from the dashboard, because their first sign-in is a
      sign-up. For ~30 known users, **off** is the tighter setting and the recommended one; pick **on**
      only if you would rather self-serve new operators than invite them.
- [ ] **3. Google provider settings.** Authentication → Sign In / Providers → Google: enabled, with the
      Client ID and Client Secret from the Google Cloud project. On the Google side, the authorized
      redirect URI is Supabase's, not this app's: `https://<project-ref>.supabase.co/auth/v1/callback`.
      Leave "Skip nonce check" **off**. Restrict the OAuth consent screen to the company's Workspace
      domain if there is one — a second, independent filter in front of the allow-list.
- [ ] **4. Redirect URL allow-list.** Authentication → URL Configuration. Site URL = the production
      origin. Redirect URLs must cover every origin the app is served from, because
      `GoogleSignInButton` sends `window.location.origin + "/auth/callback"`: the production
      `https://<host>/auth/callback`, `http://localhost:3000/auth/callback` for local work, and a
      pattern for Vercel previews if those are used. Keep the patterns as narrow as the deployment
      allows — this list is what stops an attacker-chosen origin from receiving the `code`. (The
      callback route's own redirects are `origin` + a fixed path, and the only caller-supplied input,
      `?locale`, is accepted only if it matches `routing.locales`, so there is no open redirect on our
      side either.)
- [ ] **5. JWT expiry and signing keys.** Authentication → Sessions / JWT settings. The access-token
      TTL is the residual-risk window in §4 — 3600s is the default; 900s–1800s is a reasonable trade
      for this app, since a refresh is a background call and re-runs the hook. Also switch the project
      to **asymmetric (ECC) signing keys** if it is still on the legacy shared secret: `getClaims()`
      then verifies the JWT locally in middleware instead of calling the Auth API on every request.
      `middleware.ts` logs a one-time development warning while the project is still on HS256.
- [ ] **6. Confirm the allow-list.** `/admin/users`, or `select email, role, is_active from
      public.allowed_users;` — every active row is a person who should have access today, exactly the
      owner has `role = 'admin'`, and exactly the sales managers have `role = 'manager'`. This table is
      the whole authorization model. The admin edits operator and manager rows at `/admin/users` (§5);
      admin rows are edited in the SQL editor only (0020).

After 1–6: run [supabase/tests/rls-checks.sql](../supabase/tests/rls-checks.sql) on **staging**. Its
first block calls the hook directly and asserts the refusals; its non-member block asserts that a
`role = 'none'` token, a token with no `app_metadata`, and a deactivated user see zero rows in every
table — published content included.

## 4. Residual risk: the access-token window

**An access token is believed on its signature alone.** Middleware verifies it locally with
`getClaims()` and PostgREST checks only its signature and expiry. Nothing re-reads `allowed_users`, or
asks Supabase Auth whether the user is banned, while it is valid. So removing or deactivating somebody
takes effect like this:

| Action | Takes effect |
| --- | --- |
| **Deactivate at `/admin/users`** (0017 + `lib/admin/actions/user-access.ts`) | Two steps, in this order. (1) `is_active = false`: the access-token hook refuses every new token. (2) A Supabase Auth **ban** (`auth.admin.updateUserById(id, { ban_duration: "876000h" })`): GoTrue refuses the refresh-token grant ("Invalid Refresh Token: User Banned") and any new Google sign-in (403 "User is banned") at once, **whether or not the hook is enabled**. The access token already in their browser keeps working until it expires; after that, middleware's refresh fails and they land on `/login`. |
| **Remove at `/admin/users`** (0022 + `removeUser`) | The Supabase Auth account(s) are deleted first — with them every session and refresh token, so no new access token can be minted, hook or no hook — then (optionally) the history, then the allow-list row, after which the hook refuses the email too. The access token already in their browser keeps working until it expires, exactly as after a deactivation. |
| `is_active = false` by hand in the SQL editor, or deleting the row | Step (1) only: refused at their next token issuance (every refresh included), but **no ban**. If the hook is disabled, nothing stops the refresh. Prefer the page, or ban the user under Authentication → Users as well. |
| Changing `role` (operator ↔ manager at `/admin/users`; anything involving `admin` in the SQL editor) | Their next refresh carries the new role. Until then the old role stays in force, in middleware *and* in RLS — with one exception since 0017: a demoted or deactivated admin can no longer **write the allow-list** with their old token (the guard trigger reads their current row, WT403), so they cannot restore themselves. |
| Revoking sessions (Authentication → Users → the user → sign out / revoke) | Kills the refresh token, so no new access token can be minted. Does **not** invalidate the access token already in their browser. |

**The window is the remaining TTL of the access token they are holding — at most the JWT expiry set in
step 5, one hour by default.** The ban does not shorten it: no request path in this app asks GoTrue about
a user while their access token is valid, and making middleware do so would break its network-free rule
(CLAUDE.md §4). Shortening the JWT expiry setting shortens the window proportionally; it is the only lever
short of rotating the project's JWT signing key, which invalidates every session at once and is the
break-glass option for a real compromise. The deactivate dialog on `/admin/users` says this in the
admin's language ("open pages may keep working until the access token expires, usually up to an hour").

If the ban step fails (GoTrue unreachable, the service-role key missing from the server's environment),
the row is already inactive and the page reports `auth_sync_failed` instead of success. Pressing
"deactivate" again retries only the ban. Until it succeeds the person is in the "by hand" row of the table
above: the hook still refuses their next token.

After a **removal with "also delete activity history"**, the same window has one more consequence: the
purge runs before the row is deleted, so events the removed person's still-valid token sends in that last
hour (`/api/events`, `/api/copilot`, their own `user_state`) are recorded after it, under the removed email.
They are few, age out with retention (0016), and a later purge of the same email removes them:
`select public.admin_purge_person_history('<email>');` as an admin session, or the same deletes in the SQL
editor.

For this project's threat model — ~30 internal users, an internal sales knowledge base, no financial
transactions — an hour of stale access after a deactivation or a removal is acceptable. It is **not** acceptable for
a compromised account: there, revoke the session *and* rotate the signing key.

Two smaller residual notes:

- **A rejected account may exist in `auth.users`** (see checklist step 2) with no session and no role.
  Harmless, but the Users list is not the allow-list — `public.allowed_users` is.
- **Tokens minted before 0014** carry `role: "none"`. They are refused by `roleFromClaims()` in
  middleware and by `is_member()` in every policy, and they cannot be refreshed. They expire on their
  own within one TTL.

## 5. Adding, removing and promoting people

**`/admin/users`** (the admin only, since 0017; admin semantics since 0020): add a person (email,
optional name, role `operator` or `manager`), switch a role between the two inline, deactivate or
reactivate behind a confirmation, and — since 0022 — remove an operator or a sales manager who left
(below). Admin rows are listed with an Admin badge and disabled controls, and have no remove action: they
are managed in the SQL editor only. Deactivating stays the way to pause someone: it keeps the row, their
history and their Auth account, and is undone by reactivating.

The rules, and where each is enforced (the UI enforces none of them; it only avoids offering what would
be refused). The TS and SQL checks run in the same order, so both give the same answer:

| Rule | TS (`lib/admin/actions/user-access.ts`) | Database (0017, guard body from 0020) |
| --- | --- | --- |
| Caller is an admin | `requireAdminSession()` | `allowed_users_manager_insert` / `_update` policies (`is_manager()` = `is_admin()`) |
| …and their row still says so (not a stale admin token) | pre-read of the active admins → `unauthorized` | `private.allowed_users_guard`, SQLSTATE `WT403` |
| Email valid, stored lowercase | zod (`lib/admin/users.ts`) | `allowed_users_email_lowercase_chk` |
| Only `role`, `is_active`, `full_name` change | the update payloads | column-level `GRANT UPDATE (role, is_active, full_name)` |
| The role given is `operator` or `manager` | `ASSIGNABLE_ROLES` in the zod schemas → `validation` | `allowed_users_role_chk` (all three roles), then the next rows |
| Never zero active admins | `accessViolation()` → `last_admin` | guard, `WT460` — also for `service_role` and the SQL editor |
| No admin demotes or deactivates their own row | `accessViolation()` → `self_change` | guard, `WT461` |
| Admin rows are SQL-editor-only: nothing with a JWT creates, promotes to, demotes, deactivates, reactivates, deletes or re-addresses one | `accessViolation()` → `admin_locked` | guard, `WT462` — the service-role key included; `full_name` stays editable |
| Remove only an operator's or a sales manager's row — never an admin's, never one's own, never the last admin | `accessViolation()` with `after: null` → `admin_locked` / `self_change` / `last_admin` | `GRANT DELETE` + the one `allowed_users_admin_delete` policy (`is_admin()`), then the guard: `WT403`, `WT460`, `WT461`, `WT462` |
| A removal is confirmed by typing the email again | `removeUserSchema` → `validation` (`confirmEmail`) | — (a UI safeguard against a misclick, re-checked on the server) |
| Purge only a non-admin's history, never one's own | the same pre-check, before anything is deleted | `admin_purge_person_history`: `WT403` (claim, then the caller's row), `WT461`, `WT462` |

The guard serialises every write to the table on a transaction-scoped advisory lock, so two concurrent
writes that would each leave one admin cannot both succeed: the second one re-counts after the first
commits and is refused.

Every effective insert, update and delete — from the page, the SQL editor or `service_role` — appends one
row to **`public.access_audit`** (`actor`, `target_email`, `action`, the whole row `before` and `after`).
The table is append-only: no API role can write it, and a trigger refuses `UPDATE`/`DELETE`/`TRUNCATE`
even from its owner. `actor` is the caller's JWT email, else the JWT role (`service_role`), else the
database login (`postgres` in the SQL editor).

The SQL editor is where **admin rows** live — it has no JWT, so `WT462` does not apply there, while the
last-admin rule (`WT460`) still does. The first admin on a new project is created this way, since nothing
else can create one:

```sql
-- the first admin (lowercase email — allowed_users_email_lowercase_chk)
insert into public.allowed_users (email, role) values ('owner@gmail.com', 'admin');
```

To hand admin to someone else, insert the new admin row first, then demote or deactivate the old one.
Run it with the SQL editor's role impersonation off: with it on, the session carries a JWT and the guard
treats the write as an API write.

A deactivation done there does not ban the account in Supabase Auth (§4); use the page, or also ban the
user under Authentication → Users.

### Removing a person (0022)

For someone who left. The dialog (card menu, table row, or the danger zone on their page) lists the
consequences, offers "also delete activity history" — **off by default**, because it cannot be undone — and
enables its button only once the email is typed again. `removeUser` then runs, in this order:

1. **Checks, nothing written:** the admin session; zod, including the typed confirmation; the row exists
   (`not_found` otherwise); `accessViolation` (last admin → self → admin row).
2. **The Supabase Auth account(s)** with that email are deleted (service role, `lib/auth/delete-account.ts`):
   the Google sign-in is unlinked and every session and refresh token goes with it. If GoTrue does not
   confirm, the action answers `auth_sync_failed` and nothing else has been touched.
3. **With the history option**, `admin_purge_person_history` deletes their `telemetry_events`, `user_state`
   (pins, onboarding, read receipts, the daily plan) and `copilot_logs` (their Copilot questions) rows, and
   since 0023 their attestation attempts, conversations and unlocks.
4. **The allow-list row** is deleted through the admin's own session, so the policy and the guard decide
   again; the audit trigger appends an `access_audit` row (`action = 'delete'`, the whole row as `before`,
   the admin as `actor`).

Every step is idempotent and the row goes last because it is what a retry finds the person by: after a
failure at any step, pressing the button again finishes the job (an Auth account deleted by the first
attempt is simply no longer found). Until step 4 succeeds the row is still active, so a person whose
removal failed after step 2 could sign in with Google again — creating a fresh Auth account, which the retry
deletes too.

**What is kept:** `access_audit` always — the record of who removed whom, and when; it is append-only and
the purge never touches it. Without the history option, their telemetry, `user_state` and Copilot rows stay
too: they keep counting in the dashboards, retention (0016, 0023) ages them out, and if the email is ever added
again the person finds their old pins and onboarding progress. The email can be added again at any time;
its next sign-in creates a new Auth account.

**Deploy order:** apply 0022 before (or with) the release that has the remove action. Against a database
without it, a removal deletes the Auth account (step 2) and then fails — `unknown` at the missing purge
function, or `unauthorized` at the row (no DELETE grant yet); the person stays listed, active, with no Auth
account, and the retry after applying 0022 finishes the job.

## 6. When you change any of this

- Policies, grants and hook changes are a **new numbered migration** — never an edit to an applied file
  and never a change made by hand in the SQL editor (see [MIGRATIONS.md](MIGRATIONS.md)).
- Re-run `supabase/tests/rls-checks.sql` on staging afterwards. It is the only executable check on this
  model. `supabase/tests/migration-status.sql` (read-only, safe on production) says which migrations a
  project has had, since there is no migrations table.
- The last audit of this model — what was verified, how, and what is still open — is
  [AUDIT.md](AUDIT.md) (Audit-2).
- Keep `private.is_member()` / `private.is_admin()` as the single spelling of both questions (the 0014–0019
  policies say `private.is_manager()`, its deprecated alias — never in new SQL, and never repurposed for
  the sales-manager role). A new policy that inlines `auth.jwt() -> 'app_metadata' ->> 'role'`
  re-introduces both the per-row cost and the chance of a table being left out of the next fix — and after
  0020 a literal `'manager'` hands a sales manager the owner's rows; `rls-checks.sql` fails on one.
- Never re-run `0013` on its own after `0020`: it re-creates two policies with that literal. Re-run `0014`
  after it (MIGRATIONS.md).
- Middleware must stay network-free: the role comes off the verified JWT, never from a query.

## 7. Attestation threat model

The attestation (0023, [ATTESTATION.md](ATTESTATION.md)) scores operators and sales managers, and **only the
admin may ever see a result**. The top requirement is that a candidate learns nothing about any score — their
own included — beyond "locked / available / in progress / submitted" per day. What an attacker would try, and
what stops it:

| # | Threat | Stopped by | Verified by |
| --- | --- | --- | --- |
| T1 | A candidate reads their own score, band, rubric or answer key straight from PostgREST with their session | No policy on any of the six tables names an operator or a sales manager; a `RESTRICTIVE` admin-only policy on each would still refuse one if a permissive policy were ever added by mistake. They get zero rows, not an error that says what exists. | `attestation-checks.sql` (operator, sales-manager and claim-less sweeps; a deliberately wrong permissive policy) |
| T2 | …through the app | From S05 a candidate route answers only what `lib/attestation/operator-view.ts` builds: the day, its status, `opensOn` or `afterDay` — an allow-list of keys, never a score, band, rubric word, key or explanation, and Part A never says right or wrong. | `operator-view.test.ts` (full rows with scores in, allow-listed keys out) |
| T3 | …from a client bundle or the page's messages | `rubrics.ts`, `scoring.ts`, `items-draw.ts`, `config.ts`, `operator-view.ts` and `repository.ts` import `server-only`; the admin pages render the rubric on the server. All attestation copy is under `pages.admin.assessments`, which only the admin layout sends to a browser. | `confidentiality.test.ts` (client reachability walk; the operator message payload) |
| T4 | A candidate reaches another person's attempt | The candidate path (S05) reads with the service role but filters **every** query by the verified session's email — `operatorAttestationRepo(sessionEmail(session))`, a branded type only the session can make; an attempt id from the URL is re-checked against it. No request body carries an identity. | `repository.test.ts` (every request carries `user_email=eq.<session>`) |
| T5 | The bank's answer keys leak | Items are admin-only and outside the CMS registry: no stale scan, notification, trash, version snapshot (`content_versions`) or publish-gate bundle copies them, and no operator loader, search index, Copilot retriever or `/api/content-refs` reads the table. Each attempt keeps its own `served_items` snapshot, server-side. The bank list sends the admin's browser no key or explanation. | `confidentiality.test.ts` (no registry entry; the only modules that query the tables); `item-bank.test.ts` |
| T6 | A score is changed, or history rewritten, without a trace | Scores change only through the `SECURITY DEFINER` functions (note required for an override), each writing one `assessment_audit` row; item and settings writes are audited by `SECURITY DEFINER` triggers, whoever writes (UI, SQL editor, seed). The audit is append-only for everyone, the owner included (UPDATE / DELETE / TRUNCATE refused by trigger); the service role has no access to it. | `attestation-checks.sql` |
| T7 | A demoted or deactivated admin keeps acting until their token expires | The five functions re-read the caller's `allowed_users` row under the guard's lock (`WT403`). Direct item / settings writes decide on the JWT through `private.is_admin()` — the ≤ 1 h window of §4, as for every content table. | `attestation-checks.sql` (stale admin token) |
| T8 | A bug in S05's service-role code corrupts an attempt | Column grants: the service role may insert only a start's columns and update only progress and evaluation — never `user_email`, `day`, `attempt_no`, the drawn items, the override columns or `version`; no DELETE anywhere; messages are append-only and an operator message is ≤ 600 characters in the database too; one open attempt per person and day is a unique index. | `attestation-checks.sql` (service-role limits) |
| T9 | Attempts and transcripts outlive their purpose | `retention_days` (30–3650, default 365) enforced daily by `run_assessment_retention()`; a removal with history purges them at once. The audit stays (like `access_audit`): it holds scores only for overrides. | `attestation-checks.sql` (retention, purge counts); `retention.test.ts` |
| T10 | A candidate games the AI evaluator (prompt injection, pasted answers) | S05: the rubric is confidential (T3); manipulation is flagged (`flags.manipulation`, `needs_review`) and may cap the day; client signals (paste, focus) are recorded for the admin, never shown back. | S05 |

Residual risk, accepted: the admin's browser holds everything the admin reads (by design); the ≤ 1 h token
window of T7 for item and settings writes; the service-role key, if stolen, reads every attempt — as it reads
every other table. `supabase/tests/attestation-checks.sql` runs on **staging only** (it writes rolled-back
fixtures); never against production.
