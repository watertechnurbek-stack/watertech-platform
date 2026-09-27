-- RLS verification — run against the STAGING project only (see docs/TESTING.md).
--
-- Paste the whole file into the Supabase SQL editor and run it once. It inserts
-- its own fixture rows (ids/emails prefixed `rls-test` / `@test`), calls the
-- access-token hook directly, then switches to the `authenticated` role with an
-- operator's and a sales manager's JWT claims, three non-members', and finally
-- an admin's, and asserts what each can SELECT and write. Everything runs in one
-- transaction that ends in ROLLBACK, and a failed assertion aborts that
-- transaction — either way no fixture row is ever committed.
--
--   Passed: the last result is a single row "RLS checks passed".
--   Failed: an error whose message starts with "RLS FAIL:".
--
-- Policies under test: 0002 (content_* + content_versions), 0006 (copilot_logs),
-- 0007 (admin_notifications, content_gate_reports), 0008 (rate_limits),
-- 0009 (user_state), 0010 (content_changelog), 0011 (content_contacts),
-- 0012 (content_sops), 0013 (allowed_users, telemetry_events, and the write-side
-- integrity block: append-only history, draft default, updated_by),
-- 0014 (the role gate on every policy above, and the access-token hook itself),
-- 0017 (allow-list writes: admin-only, column-limited, the last-admin /
-- self-change / stale-token guard, the append-only access_audit, and
-- admin_user_last_activity()), 0020 (role model v2: `admin` is the owner and
-- holds everything the old `manager` held; a `manager` is a sales manager and
-- gets exactly what an operator gets; admin rows are SQL-editor-only, WT462),
-- 0022 (an admin session may delete an operator's or a sales manager's
-- allow-list row — never an admin's, never their own — and
-- admin_purge_person_history() deletes one person's telemetry, user_state and
-- copilot_logs rows under the same refusals), 0023 (the attestation's five
-- admin functions refuse an operator and a sales manager; everything else about
-- the attestation tables is supabase/tests/attestation-checks.sql).
--
-- 0013 is the baseline for allowed_users and telemetry_events, which predate
-- supabase/migrations. On a project where 0013 has not been applied yet, the
-- telemetry_events checks test whatever policy that project actually has, and
-- the write-side block fails — that failure means "apply 0013", not "the
-- policies are wrong". The same applies to 0014: the hook block at the top
-- fails with "is 0014 applied?" and the non-member block reports rows that a
-- pre-0014 policy really does expose. A missing 0017, 0020 or 0022 stops the
-- file at its preflight.

begin;

-- === Fixtures (inserted as the editor's own role, before any role switch) =====

insert into public.content_scripts (id, name, cheat_sheet, stages, status) values
  ('rls-test-draft', 'RLS test draft', '', '[]', 'draft'),
  ('rls-test-published', 'RLS test published', '', '[]', 'published');
insert into public.content_objections (id, label, client_says, real_meaning, response, status) values
  ('rls-test-draft', 'RLS test', '-', '-', '-', 'draft');
insert into public.content_faqs (id, category, question, answer, status) values
  ('rls-test-draft', 'RLS', 'RLS test?', '-', 'draft');
insert into public.content_competitors (id, name, threat_level, status) values
  ('rls-test-draft', 'RLS test', 'O''rta', 'draft');
insert into public.content_package_groups (id, title, subtitle, status) values
  ('rls-test-draft', 'RLS test', '-', 'draft');
insert into public.content_packages (id, group_id, name, order_volume, payment_terms, estimated_discount, logistics, delivery_time, status) values
  ('rls-test-draft', 'rls-test-draft', 'RLS test', '-', '-', '-', '-', '-', 'draft');
insert into public.content_products (id, filename, name_ru, line, category, status) values
  ('rls-test-draft', 'rls-test-draft.jpg', 'RLS test', 'ppr', 'truba', 'draft');
-- 0010 / 0011 / 0012 carry the same published-only read policy as the 0002
-- tables, so each gets a draft row (must stay invisible to an operator) and a
-- published one (the positive control that proves GRANT and policy both work).
insert into public.content_changelog (id, published_on, title, body, approved_by, status) values
  ('rls-test-draft', current_date, 'RLS test', '-', 'rls-admin@test', 'draft'),
  ('rls-test-published', current_date, 'RLS test', '-', 'rls-admin@test', 'published');
insert into public.content_contacts (id, name, role, topic, phone, messenger, status) values
  ('rls-test-draft', 'RLS test', '-', '-', '+998 90 123 45 67', '@rlstestuser', 'draft'),
  ('rls-test-published', 'RLS test', '-', '-', '+998 90 123 45 67', '@rlstestuser', 'published');
insert into public.content_sops (id, title, summary, steps, status) values
  ('rls-test-draft', 'RLS test', '-', '[]', 'draft'),
  ('rls-test-published', 'RLS test', '-', '[]', 'published');

-- rate_limits (0008) has RLS on, no policies at all and no table grants: only
-- service_role reaches it, and only through rate_limit_hit(). A row is seeded
-- so the zeroes asserted below are "hidden", not "table happens to be empty".
insert into public.rate_limits (key, window_start, hits, expires_at) values
  ('rls-test:copilot:1m', now(), 1, now() + interval '1 minute');
-- Version snapshots can hold draft content too.
insert into public.content_versions (table_name, row_id, snapshot, actor) values
  ('content_faqs', 'rls-test-draft', '{"status":"draft"}', 'rls-admin@test');

insert into public.copilot_logs (email, question, status) values
  ('rls-other-op@test', 'RLS test question', 'ok');
insert into public.admin_notifications (kind, severity, title, table_name, row_id) values
  ('gate_blocked', 'error', 'RLS test', 'content_faqs', 'rls-test-draft');
insert into public.content_gate_reports (table_name, row_id, passed, actor) values
  ('content_faqs', 'rls-test-draft', false, 'rls-admin@test');
insert into public.telemetry_events (user_email, session_id, ts, type, path) values
  ('op@test', 'rls-test', now(), 'page_enter', '/'),
  ('rls-sales@test', 'rls-test', now(), 'page_enter', '/'),
  ('rls-other-op@test', 'rls-test', now(), 'page_enter', '/');

-- user_state (0009). user_email is spelled out here because its default reads
-- auth.jwt(), which is empty for the editor's own role.
insert into public.user_state (user_email, key, value) values
  ('op@test', 'onboarding.v2', '{"summary-d1":true}'),
  ('rls-sales@test', 'onboarding.v2', '{"summary-d1":true}'),
  ('rls-other-op@test', 'onboarding.v2', '{"summary-d1":true}');

-- allowed_users: the allow-list the access-token hook reads (0001/0014) and the
-- dashboard's operator filter lists (0005). The emails match the identities
-- used below: an operator, a sales manager (0020) and two active admins — the
-- second lets the allow-list block tell "self-change" apart from "last admin".
-- `rls-admin-off@test` is an inactive admin (the stale-token case),
-- `rls-deactivated@test` the is_active = false operator, and `rls-unknown@test`
-- is deliberately NOT inserted. Admin rows can only be written without a JWT
-- (0020, WT462) — which the editor's own role is. Since 0017 each insert here
-- also writes an access_audit row (actor = the editor's own login).
insert into public.allowed_users (email, role, is_active) values
  ('op@test', 'operator', true),
  ('rls-sales@test', 'manager', true),
  ('rls-admin@test', 'admin', true),
  ('rls-admin-2@test', 'admin', true),
  ('rls-admin-off@test', 'admin', false),
  ('rls-deactivated@test', 'operator', false);

do $$
begin
  if to_regclass('public.access_audit') is null
     or to_regprocedure('public.admin_user_last_activity()') is null
     or to_regprocedure('private.allowed_users_guard()') is null then
    raise exception 'RLS FAIL: access_audit / admin_user_last_activity() / allowed_users_guard() missing — apply 0017_user_admin_and_access_audit.sql, then re-run this file';
  end if;
  if to_regprocedure('private.is_admin()') is null then
    raise exception 'RLS FAIL: private.is_admin() missing — apply 0020_roles_admin_manager.sql, then re-run this file';
  end if;
  if to_regprocedure('public.admin_purge_person_history(text)') is null
     or not exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'allowed_users' and p.policyname = 'allowed_users_admin_delete'
     ) then
    raise exception 'RLS FAIL: admin_purge_person_history() / allowed_users_admin_delete missing — apply 0022_person_removal.sql, then re-run this file';
  end if;
end $$;

-- === The access-token hook (0014) ==============================================
-- Runs as the editor's own role, before any role switch: EXECUTE on the hook is
-- granted to supabase_auth_admin alone, and the SQL editor's `postgres` role
-- reaches it as the function's owner.
--
-- This is the half of 0014 that RLS cannot cover. An unknown or deactivated
-- account is refused a *token*, so there is no JWT for the policy checks to
-- simulate — what the policies do see in that case is the claim-less identity
-- asserted in the non-member section further down.

do $$
declare
  c record;
  result jsonb;
begin
  if to_regprocedure('public.custom_access_token_hook(jsonb)') is null then
    raise exception 'RLS FAIL: public.custom_access_token_hook(jsonb) does not exist — apply 0001 and 0014';
  end if;
  if to_regprocedure('private.is_member()') is null then
    raise exception 'RLS FAIL: private.is_member() does not exist — apply 0014_role_gated_rls.sql, then re-run this file';
  end if;

  -- On the allow-list and active: the role is stamped onto app_metadata as the
  -- row holds it (0020 needed no hook change), and the email matches
  -- case-insensitively (0014 lowercases both sides).
  for c in
    select * from (values
      ('an active operator',             'op@test',        'operator'),
      ('an active sales manager',        'rls-sales@test', 'manager'),
      ('an active admin',                'rls-admin@test', 'admin'),
      ('an active operator, MIXED case', 'Op@TEST',        'operator')
    ) as t(label, email, expected)
  loop
    result := public.custom_access_token_hook(jsonb_build_object(
      'user_id', '00000000-0000-4000-8000-000000000009',
      'authentication_method', 'oauth',
      'claims', jsonb_build_object(
        'sub', '00000000-0000-4000-8000-000000000009',
        'role', 'authenticated',
        'email', c.email,
        'app_metadata', '{}'::jsonb
      )
    ));

    if result -> 'error' is not null then
      raise exception 'RLS FAIL: the access-token hook REFUSED % (%)',
        c.label, coalesce(result -> 'error' ->> 'message', '<no message>');
    end if;
    if result -> 'claims' -> 'app_metadata' ->> 'role' is distinct from c.expected then
      raise exception 'RLS FAIL: the access-token hook stamped role % for % (expected %)',
        coalesce(result -> 'claims' -> 'app_metadata' ->> 'role', '<null>'), c.label, c.expected;
    end if;
  end loop;

  -- Absent from the allow-list, deactivated, or carrying no email at all: the
  -- hook must return the Supabase Auth Hooks error response, so GoTrue issues
  -- NO token. Contract: {"error":{"http_code":403,"message":"not_allowed"}}.
  -- Before 0014 each of these got a real `authenticated` JWT stamped
  -- role = 'none' instead, which is the P0 this file now guards.
  for c in
    select * from (values
      ('an email that is not in allowed_users',
        jsonb_build_object('sub', 'x', 'role', 'authenticated', 'email', 'rls-unknown@test', 'app_metadata', '{}'::jsonb)),
      ('an allowed_users row with is_active = false',
        jsonb_build_object('sub', 'x', 'role', 'authenticated', 'email', 'rls-deactivated@test', 'app_metadata', '{}'::jsonb)),
      ('an inactive admin row',
        jsonb_build_object('sub', 'x', 'role', 'authenticated', 'email', 'rls-admin-off@test', 'app_metadata', '{}'::jsonb)),
      ('claims with no email at all',
        jsonb_build_object('sub', 'x', 'role', 'authenticated', 'app_metadata', '{}'::jsonb))
    ) as t(label, claims)
  loop
    result := public.custom_access_token_hook(
      jsonb_build_object('authentication_method', 'oauth', 'claims', c.claims)
    );

    if result -> 'error' is null then
      raise exception 'RLS FAIL: the access-token hook ISSUED a token for % (role %) — is 0014 applied?',
        c.label, coalesce(result -> 'claims' -> 'app_metadata' ->> 'role', '<null>');
    end if;
    if coalesce((result -> 'error' ->> 'http_code')::int, 0) <> 403 then
      raise exception 'RLS FAIL: the hook refused % with http_code % (expected 403)',
        c.label, coalesce(result -> 'error' ->> 'http_code', '<null>');
    end if;
    if result -> 'error' ->> 'message' is distinct from 'not_allowed' then
      raise exception 'RLS FAIL: the hook refused % with message % (expected not_allowed)',
        c.label, coalesce(result -> 'error' ->> 'message', '<null>');
    end if;
    -- No claims may come back alongside the error: GoTrue reads the error
    -- branch first, but a response carrying both would mean the function fell
    -- through to the stamping path for someone it had already refused.
    if result -> 'claims' is not null then
      raise exception 'RLS FAIL: the hook returned claims alongside the error for %', c.label;
    end if;
  end loop;
end $$;

-- === One spelling of every role question (0014, 0020) ==========================
-- Read from the catalog, as the editor's own role. A policy that compares the
-- role claim to a literal bypasses private.is_member() / is_admin(): after 0020
-- a leftover `= 'manager'` would hand a sales manager the owner's rows. That is
-- exactly what re-running 0013 on its own re-creates (for allowed_users and
-- telemetry_events) — re-run 0014 after it.

do $$
declare
  offenders text;
  fn text;
begin
  select string_agg(format('%s.%s "%s"', p.schemaname, p.tablename, p.policyname), ', ')
    into offenders
  from pg_catalog.pg_policies p
  where p.schemaname in ('public', 'storage')
    and coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '') ~ '''(operator|manager|admin)''';
  if offenders is not null then
    raise exception 'RLS FAIL: policies compare the role claim to a literal instead of calling private.is_member()/is_admin(): % — re-run 0014 (a re-run of 0013 re-creates them)', offenders;
  end if;

  -- The helpers themselves: callable by `authenticated` (policies are
  -- evaluated as the caller), by no one else.
  foreach fn in array array['private.app_role()', 'private.is_member()', 'private.is_manager()', 'private.is_admin()'] loop
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'RLS FAIL: authenticated cannot execute % (missing GRANT)', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') then
      raise exception 'RLS FAIL: anon can execute %', fn;
    end if;
  end loop;
end $$;

-- === As an operator, and as a sales manager (0020) ============================
-- A `manager` JWT means a sales manager since 0020 and must get exactly what an
-- operator gets — so every block of this section runs once per identity, with
-- the same expectations.

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"op@test","app_metadata":{"role":"operator"}}';

do $$
declare
  ident record;
  c record;
  n bigint;
begin
  for ident in
    select * from (values
      ('operator', 'operator',
        '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"op@test","app_metadata":{"role":"operator"}}'),
      ('sales manager', 'manager',
        '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated","email":"rls-sales@test","app_metadata":{"role":"manager"}}')
    ) as t(label, role, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    -- Setup control: the helpers classify this identity as a member and as
    -- nothing more. is_manager() is is_admin() under its old name since 0020,
    -- so it must be false for a sales manager too.
    if current_user <> 'authenticated' or private.app_role() <> ident.role then
      raise exception 'RLS FAIL: setup — expected authenticated/%, got %/%', ident.role, current_user, private.app_role();
    end if;
    if not private.is_member() then
      raise exception 'RLS FAIL: private.is_member() is false for the %', ident.label;
    end if;
    if private.is_admin() or private.is_manager() then
      raise exception 'RLS FAIL: private.is_admin()/is_manager() is true for the % — is 0020 applied?', ident.label;
    end if;

    -- Positive control: proves the GRANT and claims work, so every 0 below is RLS
    -- hiding the row rather than a broken setup.
    select count(*) into n from public.content_scripts where id = 'rls-test-published';
    if n <> 1 then
      raise exception 'RLS FAIL: the % cannot read a PUBLISHED script (setup or published-read policy broken)', ident.label;
    end if;

    -- Same positive control for the three tables added after 0002.
    for c in
      select * from (values
        ('content_changelog', 'public.content_changelog'),
        ('content_contacts',  'public.content_contacts'),
        ('content_sops',      'public.content_sops')
      ) as t(label, relation)
    loop
      begin
        execute format('select count(*) from %s where id = ''rls-test-published''', c.relation) into n;
      exception when insufficient_privilege then
        raise exception 'RLS FAIL: the % gets "permission denied" on % — missing GRANT to authenticated?', ident.label, c.relation;
      end;
      if n <> 1 then
        raise exception 'RLS FAIL: the % cannot read a PUBLISHED % row (% visible)', ident.label, c.label, n;
      end if;
    end loop;

    for c in
      select * from (values
        ('draft content_scripts row',        'public.content_scripts',        $f$id = 'rls-test-draft'$f$),
        ('draft content_objections row',     'public.content_objections',     $f$id = 'rls-test-draft'$f$),
        ('draft content_faqs row',           'public.content_faqs',           $f$id = 'rls-test-draft'$f$),
        ('draft content_competitors row',    'public.content_competitors',    $f$id = 'rls-test-draft'$f$),
        ('draft content_package_groups row', 'public.content_package_groups', $f$id = 'rls-test-draft'$f$),
        ('draft content_packages row',       'public.content_packages',       $f$id = 'rls-test-draft'$f$),
        ('draft content_products row',       'public.content_products',       $f$id = 'rls-test-draft'$f$),
        ('draft content_changelog row',      'public.content_changelog',      $f$id = 'rls-test-draft'$f$),
        ('draft content_contacts row',       'public.content_contacts',       $f$id = 'rls-test-draft'$f$),
        ('draft content_sops row',           'public.content_sops',           $f$id = 'rls-test-draft'$f$),
        ('content_versions snapshot',        'public.content_versions',       $f$row_id = 'rls-test-draft'$f$),
        ('copilot_logs',                     'public.copilot_logs',           $f$true$f$),
        ('admin_notifications',              'public.admin_notifications',    $f$true$f$),
        ('content_gate_reports',             'public.content_gate_reports',   $f$true$f$),
        ('another member''s telemetry_events', 'public.telemetry_events',     $f$user_email = 'rls-other-op@test'$f$),
        ('another member''s user_state',     'public.user_state',             $f$user_email = 'rls-other-op@test'$f$),
        -- The allow-list is admin-only (0005/0014/0020) — not even the caller's
        -- own row is readable, so the filter is deliberately unrestricted.
        ('allowed_users',                    'public.allowed_users',          $f$true$f$),
        -- ...and so is its history (0017), the caller's own entries included.
        ('access_audit',                     'public.access_audit',           $f$true$f$)
      ) as t(label, relation, filter)
    loop
      begin
        execute format('select count(*) from %s where %s', c.relation, c.filter) into n;
      exception when insufficient_privilege then
        n := 0; -- "permission denied" hides the rows just as well
      end;
      if n <> 0 then
        raise exception 'RLS FAIL: the % can select % (% rows visible)', ident.label, c.label, n;
      end if;
    end loop;

    -- No content write of any kind: the insert fails its WITH CHECK, and the
    -- update / delete policies hide even the published row this identity reads.
    begin
      insert into public.content_faqs (id, category, question, answer, status)
      values ('rls-test-member-write', 'RLS', 'Member write?', '-', 'draft');
      raise exception 'RLS FAIL: the % can INSERT a content_faqs row', ident.label;
    exception when insufficient_privilege then null;
    end;

    update public.content_scripts set name = 'rls-member-was-here' where id = 'rls-test-published';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: the % can UPDATE a published content_scripts row (% rows)', ident.label, n;
    end if;

    delete from public.content_scripts where id = 'rls-test-published';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: the % can DELETE a published content_scripts row (% rows)', ident.label, n;
    end if;
  end loop;
end $$;

-- Every admin function refuses both identities itself (WT403) — not merely
-- answers zeros because RLS hid the rows. The list is checked against the
-- catalog first, so a new dashboard_* / copilot_* / admin_* function cannot
-- ship without a line here. A function the project does not have yet is
-- skipped: there is nothing to refuse.
do $$
declare
  ident record;
  call record;
  covered oid[];
  missing text;
begin
  select array_agg(to_regprocedure(t.sig)::oid)
    into covered
  from (values
    ('public.dashboard_kpis(timestamptz, timestamptz, timestamptz, text)'),
    ('public.dashboard_operator_activity(timestamptz, timestamptz, text)'),
    ('public.dashboard_hourly(timestamptz, timestamptz, text)'),
    ('public.dashboard_zero_result_searches(timestamptz, timestamptz, text, integer)'),
    ('public.dashboard_web_vitals(timestamptz, timestamptz, text)'),
    ('public.dashboard_not_helpful(timestamptz, timestamptz, text, integer)'),
    ('public.dashboard_most_viewed(timestamptz, timestamptz, text, integer)'),
    ('public.copilot_stats(timestamptz, timestamptz)'),
    ('public.copilot_unanswered(timestamptz, timestamptz, integer)'),
    ('public.admin_user_last_activity()'),
    ('public.admin_people_overview(timestamptz, timestamptz)'),
    ('public.admin_person_summary(text, timestamptz, timestamptz, timestamptz)'),
    ('public.admin_person_daily(text, timestamptz, timestamptz)'),
    ('public.admin_person_sections(text, timestamptz, timestamptz)'),
    ('public.admin_person_recent_events(text, integer)'),
    ('public.admin_top_content(timestamptz, timestamptz, integer)'),
    ('public.admin_purge_person_history(text)'),
    ('public.admin_assessment_override(uuid, numeric, text, integer)'),
    ('public.admin_assessment_clear_override(uuid, text, integer)'),
    ('public.admin_assessment_reset(uuid, integer)'),
    ('public.admin_assessment_reset_person(text)'),
    ('public.admin_assessment_unlock(text, smallint)'),
    ('public.reorder_content_rows(text, text[], integer[])')
  ) as t(sig)
  where to_regprocedure(t.sig) is not null;

  select string_agg(p.oid::regprocedure::text, ', ')
    into missing
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
  where ns.nspname = 'public'
    and (p.proname like 'dashboard\_%' or p.proname like 'copilot\_%' or p.proname like 'admin\_%'
         or p.proname = 'reorder_content_rows')
    and not (p.oid = any (coalesce(covered, '{}')));
  if missing is not null then
    raise exception 'RLS FAIL: not covered by the refusal sweep below: % — add a call for each', missing;
  end if;

  for ident in
    select * from (values
      ('operator',
        '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"op@test","app_metadata":{"role":"operator"}}'),
      ('sales manager',
        '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated","email":"rls-sales@test","app_metadata":{"role":"manager"}}')
    ) as t(label, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    for call in
      select * from (values
        ('public.dashboard_kpis(timestamptz, timestamptz, timestamptz, text)',
          'select * from public.dashboard_kpis(now() - interval ''1 day'', now(), now() - interval ''2 days'')'),
        ('public.dashboard_operator_activity(timestamptz, timestamptz, text)',
          'select * from public.dashboard_operator_activity(now() - interval ''1 day'', now())'),
        ('public.dashboard_hourly(timestamptz, timestamptz, text)',
          'select * from public.dashboard_hourly(now() - interval ''1 day'', now())'),
        ('public.dashboard_zero_result_searches(timestamptz, timestamptz, text, integer)',
          'select * from public.dashboard_zero_result_searches(now() - interval ''1 day'', now())'),
        ('public.dashboard_web_vitals(timestamptz, timestamptz, text)',
          'select * from public.dashboard_web_vitals(now() - interval ''1 day'', now())'),
        ('public.dashboard_not_helpful(timestamptz, timestamptz, text, integer)',
          'select * from public.dashboard_not_helpful(now() - interval ''1 day'', now())'),
        ('public.dashboard_most_viewed(timestamptz, timestamptz, text, integer)',
          'select * from public.dashboard_most_viewed(now() - interval ''1 day'', now())'),
        ('public.copilot_stats(timestamptz, timestamptz)',
          'select * from public.copilot_stats(now() - interval ''1 day'', now())'),
        ('public.copilot_unanswered(timestamptz, timestamptz, integer)',
          'select * from public.copilot_unanswered(now() - interval ''1 day'', now())'),
        ('public.admin_user_last_activity()',
          'select * from public.admin_user_last_activity()'),
        ('public.admin_people_overview(timestamptz, timestamptz)',
          'select * from public.admin_people_overview(now() - interval ''1 day'', now())'),
        ('public.admin_person_summary(text, timestamptz, timestamptz, timestamptz)',
          'select * from public.admin_person_summary(''op@test'', now() - interval ''1 day'', now(), now() - interval ''2 days'')'),
        ('public.admin_person_daily(text, timestamptz, timestamptz)',
          'select * from public.admin_person_daily(''op@test'', now() - interval ''1 day'', now())'),
        ('public.admin_person_sections(text, timestamptz, timestamptz)',
          'select * from public.admin_person_sections(''op@test'', now() - interval ''1 day'', now())'),
        ('public.admin_person_recent_events(text, integer)',
          'select * from public.admin_person_recent_events(''op@test'')'),
        ('public.admin_top_content(timestamptz, timestamptz, integer)',
          'select * from public.admin_top_content(now() - interval ''1 day'', now())'),
        -- Another member's history (0022): refused before anything is read.
        ('public.admin_purge_person_history(text)',
          'select public.admin_purge_person_history(''rls-other-op@test'')'),
        -- The attestation's admin writes (0023): refused before anything is
        -- read, whatever the arguments (attestation-checks.sql has the rest).
        ('public.admin_assessment_override(uuid, numeric, text, integer)',
          'select public.admin_assessment_override(gen_random_uuid(), 100, ''rls'', 1)'),
        ('public.admin_assessment_clear_override(uuid, text, integer)',
          'select public.admin_assessment_clear_override(gen_random_uuid(), ''rls'', 1)'),
        ('public.admin_assessment_reset(uuid, integer)',
          'select public.admin_assessment_reset(gen_random_uuid())'),
        ('public.admin_assessment_reset_person(text)',
          'select public.admin_assessment_reset_person(''op@test'')'),
        ('public.admin_assessment_unlock(text, smallint)',
          'select public.admin_assessment_unlock(''op@test'', 2::smallint)'),
        ('public.reorder_content_rows(text, text[], integer[])',
          'select public.reorder_content_rows(''content_faqs'', array[''rls-test-draft''], array[1])')
      ) as t(sig, sql)
    loop
      continue when to_regprocedure(call.sig) is null;
      begin
        execute call.sql;
        raise exception 'RLS FAIL: the % can call %', ident.label, call.sig;
      exception when others then
        if sqlstate <> 'WT403' then
          raise exception 'RLS FAIL: the % calling % got % (%), expected WT403',
            ident.label, call.sig, sqlstate, sqlerrm;
        end if;
      end;
    end loop;
  end loop;
end $$;

-- user_state (0009) is the only table an operator or a sales manager may
-- write, so its policies need more than the select sweep above: own row
-- readable and writable, every other member's row invisible and untouchable.
do $$
declare
  ident record;
  n bigint;
begin
  for ident in
    select * from (values
      ('operator', 'op@test',
        '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"op@test","app_metadata":{"role":"operator"}}'),
      ('sales manager', 'rls-sales@test',
        '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated","email":"rls-sales@test","app_metadata":{"role":"manager"}}')
    ) as t(label, email, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    select count(*) into n from public.user_state where user_email = ident.email;
    if n <> 1 then
      raise exception 'RLS FAIL: the % cannot select their OWN user_state row (% visible)', ident.label, n;
    end if;

    -- The insert policy takes the email from the JWT via the column default, so
    -- no email is spelled out here — exactly what hooks/useUserState.ts sends.
    insert into public.user_state (key, value) values ('scripts.position', '{"scriptId":"x","stageId":null}');
    select count(*) into n from public.user_state where user_email = ident.email and key = 'scripts.position';
    if n <> 1 then
      raise exception 'RLS FAIL: the % cannot insert their own user_state row', ident.label;
    end if;

    update public.user_state set value = '{"summary-d2":true}' where key = 'onboarding.v2';
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'RLS FAIL: the % cannot update their own user_state row, or reaches another''s (% rows)', ident.label, n;
    end if;

    delete from public.user_state where key = 'scripts.position';
    get diagnostics n = row_count;
    if n <> 1 then
      raise exception 'RLS FAIL: the % cannot delete their own user_state row (% rows)', ident.label, n;
    end if;

    -- Another member's row: invisible to update/delete (0 rows, no error), and
    -- an insert claiming their email must be rejected by the WITH CHECK.
    update public.user_state set value = '{"hacked":true}' where user_email = 'rls-other-op@test';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: the % can update ANOTHER member''s user_state row (% rows)', ident.label, n;
    end if;

    delete from public.user_state where user_email = 'rls-other-op@test';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: the % can delete ANOTHER member''s user_state row (% rows)', ident.label, n;
    end if;

    begin
      insert into public.user_state (user_email, key, value) values ('rls-other-op@test', 'pins', '[]');
      raise exception 'RLS FAIL: the % can insert a user_state row for ANOTHER member', ident.label;
    exception
      when insufficient_privilege then null; -- the WITH CHECK rejected it, as it should
    end;
  end loop;
end $$;

-- rate_limits (0008): not readable, not writable, and rate_limit_hit() not
-- callable by either — the counter behind /api/copilot's paid calls must be
-- reachable only by the server's service-role client.
--
-- allowed_users (0017/0020/0022): neither can add, promote, deactivate or
-- remove anyone — themselves included. These are the statements a direct
-- PostgREST call with their JWT would run.
do $$
declare
  ident record;
  n bigint;
begin
  for ident in
    select * from (values
      ('operator', 'op@test',
        '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated","email":"op@test","app_metadata":{"role":"operator"}}'),
      ('sales manager', 'rls-sales@test',
        '{"sub":"00000000-0000-4000-8000-000000000008","role":"authenticated","email":"rls-sales@test","app_metadata":{"role":"manager"}}')
    ) as t(label, email, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    begin
      select count(*) into n from public.rate_limits;
      raise exception 'RLS FAIL: the % can select rate_limits (% rows visible)', ident.label, n;
    exception when insufficient_privilege then null; -- no grant, as intended
    end;

    begin
      perform public.rate_limit_hit('rls-test:member', 1, 60);
      raise exception 'RLS FAIL: the % can execute rate_limit_hit()', ident.label;
    exception when insufficient_privilege then null; -- execute revoked, as intended
    end;

    -- The insert column grant is shared by every `authenticated` session, so
    -- what stops them is the guard (WT403: not an active admin, it fires
    -- before the WITH CHECK) — or the policy, should the guard be absent.
    begin
      insert into public.allowed_users (email, role) values ('rls-member-added@test', 'operator');
      raise exception 'RLS FAIL: the % can INSERT an allowed_users row', ident.label;
    exception
      when insufficient_privilege then null;
      when sqlstate 'WT403' then null;
    end;

    update public.allowed_users set role = 'admin' where email = ident.email;
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: the % can promote THEMSELVES to admin (% rows)', ident.label, n;
    end if;

    update public.allowed_users set is_active = false where email = 'rls-admin@test';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: the % can deactivate an admin (% rows)', ident.label, n;
    end if;

    -- No WHERE clause, so no SELECT policy is consulted: only the UPDATE
    -- policy's USING stands between this statement and every row. It must hide
    -- them all; reaching the guard (WT403) means the policy let them through.
    begin
      update public.allowed_users set full_name = 'rls-member-was-here';
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'RLS FAIL: the %''s unfiltered UPDATE matched % allowed_users rows', ident.label, n;
      end if;
    exception when sqlstate 'WT403' then
      raise exception 'RLS FAIL: the allowed_users UPDATE policy let the % reach rows (only the guard refused)', ident.label;
    end;

    -- DELETE is granted to every `authenticated` session since 0022; the
    -- admin-only policy is what hides every row from them, so each of these
    -- deletes nothing and never reaches the guard. The unfiltered one is the
    -- UPDATE case again: no SELECT policy is consulted, only the DELETE
    -- policy's USING — reaching the guard (WT403) means that policy let them in.
    begin
      delete from public.allowed_users where email = 'rls-admin@test';
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'RLS FAIL: the % can DELETE an admin''s allowed_users row (% rows)', ident.label, n;
      end if;

      delete from public.allowed_users where email = 'rls-deactivated@test';
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'RLS FAIL: the % can DELETE an operator''s allowed_users row (% rows)', ident.label, n;
      end if;

      delete from public.allowed_users where email = ident.email;
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'RLS FAIL: the % can DELETE their OWN allowed_users row (% rows)', ident.label, n;
      end if;

      delete from public.allowed_users;
      get diagnostics n = row_count;
      if n <> 0 then
        raise exception 'RLS FAIL: the %''s unfiltered DELETE matched % allowed_users rows', ident.label, n;
      end if;
    exception when sqlstate 'WT403' then
      raise exception 'RLS FAIL: the allowed_users DELETE policy let the % reach rows (only the guard refused)', ident.label;
    end;
  end loop;
end $$;

-- === As a non-member (0014) ====================================================
-- Three JWTs the access-token hook would never issue any more, but that the
-- database has to refuse on its own:
--
--   * role 'none'          — exactly what 0001's hook stamped for an unknown
--                            email, and what a token minted before 0014 still
--                            carries until it expires;
--   * no app_metadata      — a token issued while the hook was disabled in the
--                            dashboard, or through an Auth API call that never
--                            reached it;
--   * a deactivated user   — allowed_users.is_active = false. The hook refuses
--                            them a new token (asserted at the top of this
--                            file); RLS cannot see is_active, so what it has to
--                            refuse is the claim-less token they are left with.
--
-- Each must see NOTHING — PUBLISHED CONTENT INCLUDED. That is the difference
-- 0014 makes: before it, `status = 'published'` was the only condition on every
-- operator read policy, so any Google account that completed the OAuth flow
-- with the public anon key could read the whole knowledge base over PostgREST.
-- The counts below are therefore unfiltered, not id lookups, and every table
-- listed holds at least one fixture row — so each 0 means "hidden", not
-- "empty".

do $$
declare
  ident record;
  c record;
  n bigint;
begin
  for ident in
    select * from (values
      ('role "none"',
        '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated","email":"rls-none@test","app_metadata":{"role":"none"}}'),
      ('a token with no app_metadata',
        '{"sub":"00000000-0000-4000-8000-000000000004","role":"authenticated","email":"rls-noclaim@test"}'),
      ('a deactivated allowed_users row',
        '{"sub":"00000000-0000-4000-8000-000000000005","role":"authenticated","email":"rls-deactivated@test"}')
    ) as t(label, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    -- Setup control: the 0014/0020 helpers must be callable by `authenticated`
    -- (USAGE on private + EXECUTE) and must classify this identity as an
    -- outsider. Without it, every 0 below could just be a broken fixture.
    if private.app_role() <> 'none' then
      raise exception 'RLS FAIL: setup — private.app_role() is "%" for % (expected none)',
        private.app_role(), ident.label;
    end if;
    if private.is_member() or private.is_manager() or private.is_admin() then
      raise exception 'RLS FAIL: setup — % is classified as a member', ident.label;
    end if;

    for c in
      select * from (values
        ('content_scripts'),        -- also holds a PUBLISHED fixture row
        ('content_objections'),
        ('content_faqs'),
        ('content_competitors'),
        ('content_package_groups'),
        ('content_packages'),
        ('content_products'),
        ('content_changelog'),      -- published fixture row
        ('content_contacts'),       -- published fixture row
        ('content_sops'),           -- published fixture row
        ('content_versions'),
        ('copilot_logs'),
        ('admin_notifications'),
        ('content_gate_reports'),
        ('telemetry_events'),
        ('allowed_users'),
        ('access_audit'),
        ('user_state'),
        ('rate_limits')
      ) as t(relation)
    loop
      begin
        execute format('select count(*) from public.%I', c.relation) into n;
      exception when insufficient_privilege then
        n := 0; -- "permission denied" hides the rows just as well
      end;
      if n <> 0 then
        raise exception 'RLS FAIL: % can select public.% (% rows visible, published rows included)',
          ident.label, c.relation, n;
      end if;
    end loop;

    -- ...and cannot write per-user state either. user_email defaults to this
    -- identity's own email claim, so before 0014 — when user_state_own_insert
    -- checked only that claim — this row WOULD have been written.
    begin
      insert into public.user_state (key, value) values ('pins', '[]');
      raise exception 'RLS FAIL: % can INSERT a user_state row', ident.label;
    exception
      when insufficient_privilege then null; -- the WITH CHECK rejected it
    end;
  end loop;
end $$;

-- === As an admin (0020 — everything the pre-0020 manager held) =================

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","email":"rls-admin@test","app_metadata":{"role":"admin"}}';

do $$
declare
  c record;
  n bigint;
begin
  if current_user <> 'authenticated' or private.app_role() <> 'admin' then
    raise exception 'RLS FAIL: setup — expected authenticated/admin, got %/%', current_user, private.app_role();
  end if;
  -- is_manager() is the name 0014–0019 call: it must say yes for the admin.
  if not (private.is_member() and private.is_admin() and private.is_manager()) then
    raise exception 'RLS FAIL: setup — the admin is not member + admin + (alias) manager — is 0020 applied?';
  end if;

  for c in
    select * from (values
      ('draft content_scripts row',        'public.content_scripts',        $f$id = 'rls-test-draft'$f$),
      ('draft content_objections row',     'public.content_objections',     $f$id = 'rls-test-draft'$f$),
      ('draft content_faqs row',           'public.content_faqs',           $f$id = 'rls-test-draft'$f$),
      ('draft content_competitors row',    'public.content_competitors',    $f$id = 'rls-test-draft'$f$),
      ('draft content_package_groups row', 'public.content_package_groups', $f$id = 'rls-test-draft'$f$),
      ('draft content_packages row',       'public.content_packages',       $f$id = 'rls-test-draft'$f$),
      ('draft content_products row',       'public.content_products',       $f$id = 'rls-test-draft'$f$),
      ('draft content_changelog row',      'public.content_changelog',      $f$id = 'rls-test-draft'$f$),
      ('draft content_contacts row',       'public.content_contacts',       $f$id = 'rls-test-draft'$f$),
      ('draft content_sops row',           'public.content_sops',           $f$id = 'rls-test-draft'$f$),
      ('content_versions snapshot',        'public.content_versions',       $f$row_id = 'rls-test-draft'$f$),
      ('copilot_logs',                     'public.copilot_logs',           $f$email = 'rls-other-op@test'$f$),
      ('admin_notifications',              'public.admin_notifications',    $f$row_id = 'rls-test-draft'$f$),
      ('content_gate_reports',             'public.content_gate_reports',   $f$row_id = 'rls-test-draft'$f$),
      ('an operator''s telemetry_events',  'public.telemetry_events',       $f$user_email = 'rls-other-op@test'$f$),
      ('a sales manager''s telemetry_events', 'public.telemetry_events',    $f$user_email = 'rls-sales@test'$f$),
      ('an operator''s user_state',        'public.user_state',             $f$user_email = 'rls-other-op@test'$f$),
      ('a sales manager''s user_state',    'public.user_state',             $f$user_email = 'rls-sales@test'$f$),
      ('allowed_users',                    'public.allowed_users',          $f$email = 'op@test'$f$),
      ('access_audit (the fixture insert)', 'public.access_audit',          $f$target_email = 'op@test'$f$)
    ) as t(label, relation, filter)
  loop
    begin
      execute format('select count(*) from %s where %s', c.relation, c.filter) into n;
    exception when insufficient_privilege then
      raise exception 'RLS FAIL: admin gets "permission denied" on % — missing GRANT to authenticated?', c.relation;
    end;
    if n < 1 then
      raise exception 'RLS FAIL: admin cannot select % (0 rows visible)', c.label;
    end if;
  end loop;
end $$;

-- === As an admin: write-side integrity (0013) ==================================
-- The publish gate, the updated_by stamp and the append-only version history are
-- enforced by the database now, so they are asserted the same way the read side
-- is: through a real admin session, not the editor's own role. Note this block
-- deletes the content_package_groups fixture, so it must stay after the admin
-- read loop above.

do $$
declare
  n bigint;
  s text;
  ub text;
  snap jsonb;
begin
  -- content_versions is append-only and written only by the snapshot trigger
  -- (SECURITY DEFINER): 0013 drops content_versions_manager_insert and revokes
  -- the INSERT grant, so a hand-written history row must be rejected.
  begin
    insert into public.content_versions (table_name, row_id, snapshot, actor)
    values ('content_faqs', 'rls-test-draft', '{"forged":true}', 'rls-admin@test');
    raise exception 'RLS FAIL: admin can insert a fabricated content_versions row';
  exception
    when insufficient_privilege then null; -- policy dropped + grant revoked, as intended
  end;

  -- ...nor rewrite or erase it: 0013 revokes UPDATE and DELETE too, so what
  -- /admin/versions lists and /admin/trash restores is only what the trigger wrote.
  begin
    update public.content_versions set snapshot = '{"forged":true}' where row_id = 'rls-test-draft';
    raise exception 'RLS FAIL: admin can UPDATE content_versions rows';
  exception
    when insufficient_privilege then null;
  end;
  begin
    delete from public.content_versions where row_id = 'rls-test-draft';
    raise exception 'RLS FAIL: admin can DELETE content_versions rows';
  exception
    when insufficient_privilege then null;
  end;

  -- A new row defaults to draft: status is deliberately not named here, exactly
  -- like a direct insert from a seed script or psql would leave it.
  insert into public.content_faqs (id, category, question, answer)
  values ('rls-test-default', 'RLS', 'Default status?', '-');
  select status, updated_by into s, ub from public.content_faqs where id = 'rls-test-default';
  if s <> 'draft' then
    raise exception 'RLS FAIL: a new content_faqs row defaulted to % instead of draft', s;
  end if;
  if ub is distinct from 'rls-admin@test' then
    raise exception 'RLS FAIL: updated_by not stamped from the JWT on insert (got %)', coalesce(ub, '<null>');
  end if;

  -- updated_by comes from the JWT, never from the payload — on insert...
  insert into public.content_faqs (id, category, question, answer, status, updated_by)
  values ('rls-test-spoof', 'RLS', 'Whose email?', '-', 'draft', 'attacker@test');
  select updated_by into ub from public.content_faqs where id = 'rls-test-spoof';
  if ub is distinct from 'rls-admin@test' then
    raise exception 'RLS FAIL: insert payload set updated_by to % instead of the JWT email', coalesce(ub, '<null>');
  end if;

  -- ...and on update.
  update public.content_faqs set answer = 'edited', updated_by = 'attacker@test'
  where id = 'rls-test-spoof';
  select updated_by into ub from public.content_faqs where id = 'rls-test-spoof';
  if ub is distinct from 'rls-admin@test' then
    raise exception 'RLS FAIL: update payload set updated_by to % instead of the JWT email', coalesce(ub, '<null>');
  end if;

  -- A delete leaves history behind, and so does the cascade it triggers:
  -- content_packages.group_id references content_package_groups on delete
  -- cascade, so deleting the group must snapshot the package too.
  delete from public.content_package_groups where id = 'rls-test-draft';

  select count(*) into n from public.content_versions
  where table_name = 'content_package_groups' and row_id = 'rls-test-draft' and op = 'delete';
  if n <> 1 then
    raise exception 'RLS FAIL: deleting a content_package_groups row left % delete snapshots (expected 1)', n;
  end if;

  select snapshot, actor into snap, ub from public.content_versions
  where table_name = 'content_packages' and row_id = 'rls-test-draft' and op = 'delete';
  if snap is null then
    raise exception 'RLS FAIL: the CASCADED content_packages delete left no snapshot';
  end if;
  if snap->>'id' <> 'rls-test-draft' or snap->>'group_id' <> 'rls-test-draft' then
    raise exception 'RLS FAIL: the cascaded content_packages snapshot holds the wrong row (%)', snap;
  end if;
  if ub is distinct from 'rls-admin@test' then
    raise exception 'RLS FAIL: delete snapshot actor is % instead of the JWT email', coalesce(ub, '<null>');
  end if;

  -- The rows themselves are gone; only their history remains.
  select count(*) into n from public.content_packages where id = 'rls-test-draft';
  if n <> 0 then
    raise exception 'RLS FAIL: the cascaded content_packages row survived the delete';
  end if;
end $$;

-- An admin may READ every user_state row (the onboarding progress table on
-- /dashboard/quality) and nothing more — there is deliberately no admin
-- insert/update/delete policy in 0009.
do $$
declare
  n bigint;
begin
  update public.user_state set value = '{"hacked":true}' where user_email = 'op@test';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'RLS FAIL: admin can update an operator''s user_state row (% rows)', n;
  end if;

  delete from public.user_state where user_email = 'op@test';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'RLS FAIL: admin can delete an operator''s user_state row (% rows)', n;
  end if;

  begin
    insert into public.user_state (user_email, key, value) values ('op@test', 'pins', '[]');
    raise exception 'RLS FAIL: admin can insert a user_state row for an operator';
  exception
    when insufficient_privilege then null; -- no admin insert policy, as intended
  end;
end $$;

-- rate_limits (0008): not readable, not writable, and rate_limit_hit() not
-- callable by the admin either — the counter behind /api/copilot's paid calls
-- must be reachable only by the server's service-role client.
do $$
declare
  n bigint;
begin
  begin
    select count(*) into n from public.rate_limits;
    raise exception 'RLS FAIL: admin can select rate_limits (% rows visible)', n;
  exception when insufficient_privilege then null; -- no grant, as intended
  end;

  begin
    perform public.rate_limit_hit('rls-test:admin', 1, 60);
    raise exception 'RLS FAIL: admin can execute rate_limit_hit()';
  exception when insufficient_privilege then null; -- execute revoked, as intended
  end;
end $$;

-- === As an admin: allow-list administration (0017, 0020) =======================
-- What /admin/users does, run as the statements PostgREST would run for it.
-- Each refusal below is asserted by SQLSTATE — the same codes
-- lib/admin/actions/user-access.ts turns into last_admin / self_change /
-- admin_locked / unauthorized — so they prove the database refuses on its own,
-- UI or not.

do $$
declare
  n bigint;
  ub text;
  audit record;
  col text;
begin
  -- Add: allowed, stamped with the admin's JWT email, and audited.
  insert into public.allowed_users (email, role, full_name) values ('rls-new@test', 'operator', 'RLS New');
  select updated_by into ub from public.allowed_users where email = 'rls-new@test';
  if ub is distinct from 'rls-admin@test' then
    raise exception 'RLS FAIL: allowed_users insert stamped updated_by = % (expected the JWT email)', coalesce(ub, '<null>');
  end if;

  select * into audit from public.access_audit where target_email = 'rls-new@test' and action = 'insert';
  if audit is null or audit.actor is distinct from 'rls-admin@test' or audit.before is not null
     or audit.after ->> 'role' is distinct from 'operator' then
    raise exception 'RLS FAIL: the insert audit row is wrong or missing (%)', to_jsonb(audit);
  end if;

  -- Operator -> sales manager: allowed, audited with before and after.
  update public.allowed_users set role = 'manager' where email = 'rls-new@test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'RLS FAIL: admin cannot change another row''s role (% rows)', n;
  end if;
  select count(*) into n from public.access_audit
  where target_email = 'rls-new@test' and action = 'update'
    and before ->> 'role' = 'operator' and after ->> 'role' = 'manager' and actor = 'rls-admin@test';
  if n <> 1 then
    raise exception 'RLS FAIL: the role change left % matching audit rows (expected 1)', n;
  end if;

  -- An update that changes nothing is not an event.
  update public.allowed_users set role = 'manager' where email = 'rls-new@test';
  select count(*) into n from public.access_audit where target_email = 'rls-new@test' and action = 'update';
  if n <> 1 then
    raise exception 'RLS FAIL: a no-op update wrote an audit row (% update rows)', n;
  end if;

  -- Column grants: role, is_active and full_name only.
  foreach col in array array['email', 'created_at', 'updated_at', 'updated_by'] loop
    begin
      execute format(
        'update public.allowed_users set %I = %L where email = %L',
        col,
        case col when 'email' then 'rls-renamed@test' when 'updated_by' then 'attacker@test' else '2020-01-01' end,
        'rls-new@test'
      );
      raise exception 'RLS FAIL: admin can UPDATE allowed_users.%', col;
    exception when insufficient_privilege then null; -- no column grant, as intended
    end;
  end loop;

  -- Removing a row (0022) has its own block below.

  -- Admin rows are SQL-editor-only (0020, WT462) — for the admin too. Two
  -- admins are active (rls-admin, rls-admin-2) and none of these touches the
  -- caller's own row, so neither WT460 nor WT461 is what refuses.
  begin
    insert into public.allowed_users (email, role) values ('rls-admin-new@test', 'admin');
    raise exception 'RLS FAIL: admin can INSERT an admin row through the API';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set role = 'admin' where email = 'rls-new@test';
    raise exception 'RLS FAIL: admin can PROMOTE a sales manager to admin through the API';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set role = 'admin' where email = 'op@test';
    raise exception 'RLS FAIL: admin can PROMOTE an operator to admin through the API';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set role = 'manager' where email = 'rls-admin-2@test';
    raise exception 'RLS FAIL: admin can DEMOTE another admin through the API';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set is_active = false where email = 'rls-admin-2@test';
    raise exception 'RLS FAIL: admin can DEACTIVATE another admin through the API';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set is_active = true where email = 'rls-admin-off@test';
    raise exception 'RLS FAIL: admin can REACTIVATE an admin row through the API';
  exception when sqlstate 'WT462' then null;
  end;

  -- The display name is the one thing on an admin row the API may change.
  update public.allowed_users set full_name = 'RLS Admin 2' where email = 'rls-admin-2@test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'RLS FAIL: admin cannot rename another admin row (% rows)', n;
  end if;

  -- Their own row: renaming is fine, demoting or deactivating is not — with
  -- another active admin left, "self" is what refuses (WT461 before WT462).
  update public.allowed_users set full_name = 'RLS Admin' where email = 'rls-admin@test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'RLS FAIL: admin cannot rename their own row (% rows)', n;
  end if;

  begin
    update public.allowed_users set role = 'operator' where email = 'rls-admin@test';
    raise exception 'RLS FAIL: admin can DEMOTE their own row';
  exception when sqlstate 'WT461' then null;
  end;

  begin
    update public.allowed_users set is_active = false where email = 'rls-admin@test';
    raise exception 'RLS FAIL: admin can DEACTIVATE their own row';
  exception when sqlstate 'WT461' then null;
  end;

  -- The history is append-only for an admin too.
  begin
    update public.access_audit set actor = 'attacker@test';
    raise exception 'RLS FAIL: admin can UPDATE access_audit';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.access_audit;
    raise exception 'RLS FAIL: admin can DELETE from access_audit';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.access_audit (actor, target_email, action) values ('attacker@test', 'op@test', 'insert');
    raise exception 'RLS FAIL: admin can INSERT a forged access_audit row';
  exception when insufficient_privilege then null;
  end;

  -- Last activity: op@test has a telemetry fixture row, rls-new@test none.
  select count(*) into n from public.admin_user_last_activity()
  where member_email = 'op@test' and last_seen_at is not null;
  if n <> 1 then
    raise exception 'RLS FAIL: admin_user_last_activity() has no last_seen_at for op@test';
  end if;
  select count(*) into n from public.admin_user_last_activity()
  where member_email = 'rls-new@test' and last_seen_at is null;
  if n <> 1 then
    raise exception 'RLS FAIL: admin_user_last_activity() invented activity for rls-new@test';
  end if;
end $$;

-- === As an admin: removing a person (0022) =====================================
-- What "remove" on /admin/users does after the Supabase Auth account is gone:
-- optionally the history purge, then the allow-list row. Two admins are active
-- (rls-admin, rls-admin-2), so WT460 is not what refuses anything here.

do $$
declare
  n bigint;
  audit record;
  audit_rows bigint;
  purged jsonb;
begin
  -- An operator row and a sales-manager row: each deleted, each audited with
  -- the whole row as `before`, the admin as the actor and no `after`.
  insert into public.allowed_users (email, role, full_name) values
    ('rls-leaver-op@test', 'operator', 'RLS Leaver'),
    ('rls-leaver-sales@test', 'manager', 'RLS Leaver 2');

  delete from public.allowed_users where email = 'rls-leaver-op@test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'RLS FAIL: admin cannot DELETE an operator''s allowed_users row (% rows)', n;
  end if;
  delete from public.allowed_users where email = 'rls-leaver-sales@test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'RLS FAIL: admin cannot DELETE a sales manager''s allowed_users row (% rows)', n;
  end if;

  for audit in
    select a.target_email, a.actor, a.before, a.after
    from public.access_audit a
    where a.target_email in ('rls-leaver-op@test', 'rls-leaver-sales@test') and a.action = 'delete'
  loop
    if audit.actor is distinct from 'rls-admin@test' or audit.after is not null
       or audit.before ->> 'email' is distinct from audit.target_email
       or audit.before ->> 'role' not in ('operator', 'manager') then
      raise exception 'RLS FAIL: the delete audit row for % is wrong (%)', audit.target_email, to_jsonb(audit);
    end if;
  end loop;
  select count(*) into n from public.access_audit
  where target_email in ('rls-leaver-op@test', 'rls-leaver-sales@test') and action = 'delete';
  if n <> 2 then
    raise exception 'RLS FAIL: two removals left % delete audit rows (expected 2)', n;
  end if;

  -- Admin rows stay SQL-editor-only (WT462), active or not; the caller's own
  -- row is "self" first (WT461 before WT462).
  begin
    delete from public.allowed_users where email = 'rls-admin-2@test';
    raise exception 'RLS FAIL: admin can DELETE another admin row through the API';
  exception when sqlstate 'WT462' then null;
  end;
  begin
    delete from public.allowed_users where email = 'rls-admin-off@test';
    raise exception 'RLS FAIL: admin can DELETE an inactive admin row through the API';
  exception when sqlstate 'WT462' then null;
  end;
  begin
    delete from public.allowed_users where email = 'rls-admin@test';
    raise exception 'RLS FAIL: admin can DELETE their own row';
  exception when sqlstate 'WT461' then null;
  end;

  -- The history purge. rls-other-op@test has one row in each of the three
  -- tables (fixtures) and no allow-list row — the purge does not need one. The
  -- argument is normalised; access_audit is never touched.
  --
  -- The function is the only way in: the admin's own session cannot delete
  -- these rows (no DELETE grant on telemetry_events since 0013, no DELETE
  -- policy on copilot_logs, and user_state's delete policy is own-rows only).
  begin
    delete from public.telemetry_events where user_email = 'rls-other-op@test';
    raise exception 'RLS FAIL: an admin session can DELETE telemetry_events rows directly';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.copilot_logs where email = 'rls-other-op@test';
    get diagnostics n = row_count;
    if n <> 0 then
      raise exception 'RLS FAIL: an admin session can DELETE copilot_logs rows directly (% rows)', n;
    end if;
  exception when insufficient_privilege then null;
  end;
  delete from public.user_state where user_email = 'rls-other-op@test';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'RLS FAIL: an admin session can DELETE another member''s user_state rows directly (% rows)', n;
  end if;

  select count(*) into audit_rows from public.access_audit;
  -- 0023 adds three attestation counts to the result; this fixture has no
  -- attestation rows, so only 0022's three are compared here
  -- (attestation-checks.sql covers the rest).
  select public.admin_purge_person_history('  RLS-Other-Op@Test ')
           - array['assessment_attempts', 'assessment_messages', 'assessment_unlocks']
    into purged;
  if purged is distinct from '{"telemetry": 1, "user_state": 1, "copilot": 1}'::jsonb then
    raise exception 'RLS FAIL: admin_purge_person_history returned %, expected one row of each', purged;
  end if;
  if exists (select 1 from public.telemetry_events where user_email = 'rls-other-op@test')
     or exists (select 1 from public.user_state where user_email = 'rls-other-op@test')
     or exists (select 1 from public.copilot_logs where email = 'rls-other-op@test') then
    raise exception 'RLS FAIL: admin_purge_person_history left rows of the purged email behind';
  end if;
  if (select count(*) from public.telemetry_events where user_email = 'op@test') <> 1
     or (select count(*) from public.user_state where user_email = 'op@test') <> 1 then
    raise exception 'RLS FAIL: admin_purge_person_history deleted somebody else''s rows';
  end if;
  if (select count(*) from public.access_audit) <> audit_rows then
    raise exception 'RLS FAIL: admin_purge_person_history wrote to or deleted from access_audit';
  end if;

  -- A repeat finds nothing: the retry of a removal that failed after its purge.
  select public.admin_purge_person_history('rls-other-op@test')
           - array['assessment_attempts', 'assessment_messages', 'assessment_unlocks']
    into purged;
  if purged is distinct from '{"telemetry": 0, "user_state": 0, "copilot": 0}'::jsonb then
    raise exception 'RLS FAIL: a repeated purge returned %, expected zeros', purged;
  end if;

  -- The refusals: the caller's own history (WT461, normalised too), an admin
  -- row's — active or not (WT462) — and an empty email (WT400).
  begin
    perform public.admin_purge_person_history(' RLS-Admin@test');
    raise exception 'RLS FAIL: admin can purge their OWN history';
  exception when sqlstate 'WT461' then null;
  end;
  begin
    perform public.admin_purge_person_history('rls-admin-2@test');
    raise exception 'RLS FAIL: admin can purge another admin''s history';
  exception when sqlstate 'WT462' then null;
  end;
  begin
    perform public.admin_purge_person_history('rls-admin-off@test');
    raise exception 'RLS FAIL: admin can purge an inactive admin''s history';
  exception when sqlstate 'WT462' then null;
  end;
  begin
    perform public.admin_purge_person_history('   ');
    raise exception 'RLS FAIL: admin_purge_person_history accepted an empty email';
  exception when sqlstate 'WT400' then null;
  end;
end $$;

-- An admin token whose allow-list row no longer says admin: demoted (op@test)
-- or deactivated (rls-admin-off@test) while the old access token is still
-- valid. RLS believes the claim; the guard reads the row (WT403, first).
do $$
declare
  ident record;
begin
  for ident in
    select * from (values
      ('a demoted admin',     '{"sub":"00000000-0000-4000-8000-000000000006","role":"authenticated","email":"op@test","app_metadata":{"role":"admin"}}'),
      ('a deactivated admin', '{"sub":"00000000-0000-4000-8000-000000000007","role":"authenticated","email":"rls-admin-off@test","app_metadata":{"role":"admin"}}')
    ) as t(label, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    begin
      insert into public.allowed_users (email, role) values ('rls-backdoor@test', 'operator');
      raise exception 'RLS FAIL: % (stale admin token) can INSERT a row', ident.label;
    exception when sqlstate 'WT403' then null;
    end;

    begin
      update public.allowed_users set role = 'admin', is_active = true where email = ident.claims::jsonb ->> 'email';
      raise exception 'RLS FAIL: % (stale admin token) can restore their own admin row', ident.label;
    exception when sqlstate 'WT403' then null;
    end;

    begin
      update public.allowed_users set is_active = false where email = 'rls-deactivated@test';
      raise exception 'RLS FAIL: % (stale admin token) can change another row', ident.label;
    exception when sqlstate 'WT403' then null;
    end;

    -- 0022: the delete policy believes the claim; the guard does not.
    begin
      delete from public.allowed_users where email = 'rls-deactivated@test';
      raise exception 'RLS FAIL: % (stale admin token) can DELETE a row', ident.label;
    exception when sqlstate 'WT403' then null;
    end;

    -- ...and the purge reads the caller's row like the guard does.
    begin
      perform public.admin_purge_person_history('rls-sales@test');
      raise exception 'RLS FAIL: % (stale admin token) can purge a person''s history', ident.label;
    exception when sqlstate 'WT403' then null;
    end;
  end loop;
end $$;

-- The other stale token: an active admin row whose token still says operator
-- (promoted in the SQL editor within the last hour). Row and claim must both
-- say admin — the purge asks the claim first (WT403), and the delete policy
-- hides every row until the token is refreshed.
do $$
declare
  n bigint;
begin
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000009","role":"authenticated","email":"rls-admin-2@test","app_metadata":{"role":"operator"}}',
    true);

  begin
    perform public.admin_purge_person_history('rls-sales@test');
    raise exception 'RLS FAIL: an operator token of an active admin row can purge a person''s history';
  exception when sqlstate 'WT403' then null;
  end;

  delete from public.allowed_users where email = 'rls-deactivated@test';
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'RLS FAIL: an operator token of an active admin row can DELETE an allowed_users row (% rows)', n;
  end if;
end $$;

-- === The owner's side of 0017 and 0020 =========================================
-- The editor's own role (the table owner, RLS bypassed). First with the claims
-- PostgREST sends for the service-role key: a JWT, so admin rows are closed to
-- it (WT462), but no email, so no actor and no "self".

reset role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  n bigint;
begin
  -- Both fixture admins are still active, so WT460 is not what refuses.
  begin
    insert into public.allowed_users (email, role) values ('rls-sr-admin@test', 'admin');
    raise exception 'RLS FAIL: the service role can INSERT an admin row';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set role = 'admin' where email = 'op@test';
    raise exception 'RLS FAIL: the service role can PROMOTE a row to admin';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    update public.allowed_users set is_active = false where email = 'rls-admin-2@test';
    raise exception 'RLS FAIL: the service role can DEACTIVATE an admin';
  exception when sqlstate 'WT462' then null;
  end;

  -- Moving an admin row to another address would hand admin to another identity.
  begin
    update public.allowed_users set email = 'rls-admin-moved@test' where email = 'rls-admin-2@test';
    raise exception 'RLS FAIL: the service role can change an admin row''s email';
  exception when sqlstate 'WT462' then null;
  end;

  begin
    delete from public.allowed_users where email = 'rls-admin-2@test';
    raise exception 'RLS FAIL: the service role can DELETE an admin row';
  exception when sqlstate 'WT462' then null;
  end;

  -- Everything else still works for it, audited with the JWT role as the actor.
  update public.allowed_users set full_name = 'Renamed by the service role' where email = 'op@test';
  select count(*) into n from public.access_audit
  where target_email = 'op@test' and action = 'update' and actor = 'service_role';
  if n <> 1 then
    raise exception 'RLS FAIL: a service-role update left % audit rows (expected 1)', n;
  end if;
end $$;

-- Now the SQL editor itself: no JWT at all. Admin rows are its to manage —
-- which is how the first admin is created — but the last active admin is kept
-- even here (WT460).
set local request.jwt.claims = '';

do $$
declare
  n bigint;
begin
  insert into public.allowed_users (email, role) values ('rls-admin-3@test', 'admin');
  delete from public.allowed_users where email = 'rls-admin-3@test';
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'RLS FAIL: the SQL editor cannot add and remove an admin row (% deleted)', n;
  end if;

  -- Every other admin off — staging's real ones too; the whole file rolls back.
  update public.allowed_users set is_active = false
  where role = 'admin' and is_active and email <> 'rls-admin@test';

  select count(*) into n from public.allowed_users where role = 'admin' and is_active;
  if n <> 1 then
    raise exception 'RLS FAIL: setup — expected exactly one active admin, found %', n;
  end if;

  begin
    update public.allowed_users set role = 'operator' where email = 'rls-admin@test';
    raise exception 'RLS FAIL: the SQL editor demoted the LAST active admin';
  exception when sqlstate 'WT460' then null;
  end;

  begin
    update public.allowed_users set is_active = false where email = 'rls-admin@test';
    raise exception 'RLS FAIL: the SQL editor deactivated the LAST active admin';
  exception when sqlstate 'WT460' then null;
  end;

  begin
    delete from public.allowed_users where email = 'rls-admin@test';
    raise exception 'RLS FAIL: the SQL editor deleted the LAST active admin';
  exception when sqlstate 'WT460' then null;
  end;
end $$;

-- The service role meets "last admin" first, too: WT460 is checked before
-- WT462, and a whole-table UPDATE is refused like a single row.
set local request.jwt.claims = '{"role":"service_role"}';

do $$
begin
  begin
    update public.allowed_users set is_active = false where role = 'admin';
    raise exception 'RLS FAIL: a service-role UPDATE deactivated the last active admin';
  exception when sqlstate 'WT460' then null;
  end;
end $$;

-- ...and so does the last admin in their own session: WT460 comes before both
-- "self" (WT461) and "admin rows are SQL-editor-only" (WT462), because it is
-- the refusal the SQL editor would give them as well.
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated","email":"rls-admin@test","app_metadata":{"role":"admin"}}';

do $$
begin
  begin
    update public.allowed_users set role = 'operator' where email = 'rls-admin@test';
    raise exception 'RLS FAIL: the LAST active admin demoted themselves';
  exception when sqlstate 'WT460' then null;
  end;

  begin
    update public.allowed_users set is_active = false where email = 'rls-admin@test';
    raise exception 'RLS FAIL: the LAST active admin deactivated themselves';
  exception when sqlstate 'WT460' then null;
  end;

  -- The delete policy (0022) lets the admin reach their own row; the guard
  -- answers "last admin" before "self".
  begin
    delete from public.allowed_users where email = 'rls-admin@test';
    raise exception 'RLS FAIL: the LAST active admin deleted themselves';
  exception when sqlstate 'WT460' then null;
  end;
end $$;

reset role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
declare
  c record;
begin
  -- The append-only trigger stops even the owner.
  begin
    delete from public.access_audit where target_email = 'op@test';
    raise exception 'RLS FAIL: the table owner can DELETE from access_audit';
  exception when insufficient_privilege then null;
  end;

  -- The grant matrix, read from the catalog so it holds without a role switch.
  for c in
    select * from (values
      ('service_role', 'public.access_audit',  'INSERT'),
      ('service_role', 'public.access_audit',  'UPDATE'),
      ('service_role', 'public.access_audit',  'DELETE'),
      ('service_role', 'public.access_audit',  'TRUNCATE'),
      ('authenticated', 'public.access_audit', 'INSERT'),
      ('anon',          'public.access_audit', 'SELECT'),
      ('authenticated', 'public.allowed_users', 'TRUNCATE'),
      ('anon',          'public.allowed_users', 'SELECT'),
      ('anon',          'public.allowed_users', 'INSERT'),
      ('anon',          'public.allowed_users', 'DELETE'),
      -- Revoked by 0013; 0022's purge is SECURITY DEFINER so it stays that way.
      ('authenticated', 'public.telemetry_events', 'DELETE')
    ) as t(grantee, relation, privilege)
  loop
    if has_table_privilege(c.grantee, c.relation, c.privilege) then
      raise exception 'RLS FAIL: % holds % on %', c.grantee, c.privilege, c.relation;
    end if;
  end loop;

  -- 0022: DELETE on allowed_users for `authenticated`, behind exactly one
  -- DELETE policy — the admin-only one. A second permissive policy would widen
  -- it, which the behavioural checks above could not tell apart from this one.
  if not has_table_privilege('authenticated', 'public.allowed_users', 'DELETE') then
    raise exception 'RLS FAIL: authenticated cannot DELETE from allowed_users (0022 grant missing — was 0017 re-run after it?)';
  end if;
  if (select count(*) from pg_catalog.pg_policies p
      where p.schemaname = 'public' and p.tablename = 'allowed_users' and p.cmd in ('DELETE', 'ALL')) <> 1
     or not exists (
       select 1 from pg_catalog.pg_policies p
       where p.schemaname = 'public' and p.tablename = 'allowed_users'
         and p.policyname = 'allowed_users_admin_delete' and p.cmd = 'DELETE'
         and p.permissive = 'PERMISSIVE' and p.roles = '{authenticated}'
         and p.qual like '%private.is_admin()%'
     ) then
    raise exception 'RLS FAIL: allowed_users DELETE policies are not exactly 0022''s allowed_users_admin_delete';
  end if;

  -- SECURITY DEFINER with an empty search_path: the one privileged path into
  -- three tables no session role may delete from, and no schema on a
  -- caller's path can shadow a name inside it.
  if not exists (
    select 1 from pg_catalog.pg_proc p
    where p.oid = 'public.admin_purge_person_history(text)'::regprocedure
      and p.prosecdef
      and p.proconfig @> array['search_path=""']
  ) then
    raise exception 'RLS FAIL: admin_purge_person_history is not SECURITY DEFINER with search_path = ''''';
  end if;

  if not has_function_privilege('authenticated', 'public.admin_purge_person_history(text)', 'EXECUTE') then
    raise exception 'RLS FAIL: authenticated cannot execute admin_purge_person_history (missing GRANT)';
  end if;
  for c in select * from (values ('anon'), ('service_role'), ('public')) as t(grantee) loop
    if has_function_privilege(c.grantee, 'public.admin_purge_person_history(text)', 'EXECUTE') then
      raise exception 'RLS FAIL: % can execute admin_purge_person_history', c.grantee;
    end if;
  end loop;

  for c in
    select * from (values ('email'), ('created_at'), ('updated_at'), ('updated_by')) as t(col)
  loop
    if has_column_privilege('authenticated', 'public.allowed_users', c.col, 'UPDATE') then
      raise exception 'RLS FAIL: authenticated may UPDATE allowed_users.%', c.col;
    end if;
  end loop;
end $$;

rollback;

select 'RLS checks passed' as result;
