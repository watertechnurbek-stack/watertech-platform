-- Attestation checks — run against the STAGING project only (see docs/TESTING.md).
--
-- Paste the whole file into the Supabase SQL editor and run it once, after
-- 0023_attestation.sql. It adds allow-list rows (emails `att-*@test`: two
-- active admins, an inactive one, two operators, a sales manager), three bank
-- items, attempts in every state, a transcript and an unlock — then asserts
-- what 0023 promises (docs/ATTESTATION.md §7, §12, §13):
--
--   * the catalogue: RLS on all six tables, a restrictive admin-only policy on
--     each, no policy a non-admin passes, and the exact grants — nothing for
--     anon, no write for a session on attempts / messages / unlocks / audit,
--     the service role narrowed to what S05 needs;
--   * an operator, a sales manager and a claim-less token read zero rows of
--     every table (their own attempts included — even with a permissive policy
--     added by mistake), write nothing, and get WT403 from every admin function;
--   * the admin reads everything; item and config writes are version-guarded,
--     checked (the publish rules, every JSON shape) and audited; override,
--     clear, reset, reset-person and unlock do what they say, refuse what they must
--     (WT400 / WT403 / WT404 / WT409), audit once and return no score; the
--     partial unique index allows one open attempt per (person, day);
--   * the audit and the transcript are append-only; an operator message is
--     at most 600 characters;
--   * admin_purge_person_history also deletes attempts (messages cascade) and
--     unlocks and says how many; run_assessment_retention honours
--     retention_days.
--
-- Everything runs in one transaction that ends in ROLLBACK, and a failed
-- assertion aborts it — either way no fixture row is ever committed. The
-- allow-list rows are inserted before any role switch: an admin row may only be
-- written without a JWT (WT462, 0020).
--
--   Passed: the last result is a single row "Attestation checks passed".
--   Failed: an error whose message starts with "ATTESTATION FAIL:".

begin;

set local timezone to 'UTC';

do $$
begin
  if to_regclass('public.assessment_attempts') is null
     or to_regprocedure('public.admin_assessment_override(uuid, numeric, text, integer)') is null
     or to_regprocedure('public.run_assessment_retention(boolean)') is null then
    raise exception 'ATTESTATION FAIL: the attestation tables / functions are missing — apply 0023_attestation.sql, then re-run this file';
  end if;
  if position('assessment_attempts' in (
       select p.prosrc from pg_catalog.pg_proc p
       where p.oid = 'public.admin_purge_person_history(text)'::regprocedure
     )) = 0 then
    raise exception 'ATTESTATION FAIL: admin_purge_person_history() does not delete attestation rows — was 0022 re-run after 0023? Re-run 0023_attestation.sql';
  end if;
  if not exists (select 1 from public.assessment_config where id = 1) then
    raise exception 'ATTESTATION FAIL: the assessment_config row is missing — re-run 0023_attestation.sql';
  end if;
end $$;

-- === Fixtures (as the editor's own role, before any role switch) ===============

insert into public.allowed_users (email, role, is_active) values
  ('att-admin@test', 'admin', true),
  ('att-admin-2@test', 'admin', true),
  ('att-admin-off@test', 'admin', false),
  ('att-op@test', 'operator', true),
  ('att-op-2@test', 'operator', true),
  ('att-mgr@test', 'manager', true);

insert into public.assessment_items (id, day, topic, kind, difficulty, prompt, prompt_ru, options, answer_key, explanation, explanation_ru, status) values
  ('att-test-single', 1, 'company', 'single', 1, 'Kafolat muddati?', 'Срок гарантии?',
   '[{"id":"a","text":"1 yil","text_ru":"1 год"},{"id":"b","text":"10 yil","text_ru":"10 лет"}]', '{b}',
   'FAQ: 10 yil.', 'FAQ: 10 лет.', 'published'),
  ('att-test-multi', 1, 'product-lines', 'multi', 2, 'Liniyalar?', 'Линейки?',
   '[{"id":"a","text":"PPR","text_ru":"ППР"},{"id":"b","text":"Kanalizatsiya","text_ru":"Канализация"},{"id":"c","text":"Po''lat","text_ru":"Сталь"}]', '{a,b}',
   null, null, 'published'),
  ('att-test-draft', 2, 'sizes', 'single', 3, 'Qoralama', null,
   '[{"id":"a","text":"Bir","text_ru":null},{"id":"b","text":"Ikki","text_ru":null}]', '{}',
   null, null, 'draft');

-- att-op: day 1 evaluated (the score an operator must never see), day 2 in
-- progress. att-mgr: day 1 submitted. att-op-2: day 1 evaluated with a
-- transcript and an unlock (the purge target).
insert into public.assessment_attempts
  (id, user_email, day, attempt_no, status, phase, started_at, submitted_at, item_ids,
   part_a_score, part_b_score, day_score, rubric)
values
  ('a0000000-0000-4000-8000-000000000001', 'att-op@test', 1, 1, 'evaluated', 'part_b',
   now() - interval '2 days', now() - interval '2 days', '{att-test-single,att-test-multi}',
   87.25, 91.5, 89.8, '[{"criterion":"greeting","score":90}]'),
  ('a0000000-0000-4000-8000-000000000002', 'att-op@test', 2, 1, 'in_progress', 'part_a',
   now() - interval '1 hour', null, '{att-test-draft}', null, null, null, null),
  ('a0000000-0000-4000-8000-000000000003', 'att-mgr@test', 1, 1, 'submitted', 'part_b',
   now() - interval '3 hours', now() - interval '2 hours', '{att-test-single}', 50, null, null, null),
  ('a0000000-0000-4000-8000-000000000004', 'att-op-2@test', 1, 1, 'evaluated', 'part_b',
   now() - interval '5 days', now() - interval '5 days', '{att-test-single}', 40, 55, 49, null);

insert into public.assessment_messages (attempt_id, seq, role, content) values
  ('a0000000-0000-4000-8000-000000000004', 1, 'customer', 'Assalomu alaykum, quvur kerak edi.'),
  ('a0000000-0000-4000-8000-000000000004', 2, 'operator', 'Va alaykum assalom! Qaysi diametr kerak?'),
  ('a0000000-0000-4000-8000-000000000001', 1, 'customer', 'Salom.');

insert into public.assessment_unlocks (user_email, day, unlocked_by) values
  ('att-op-2@test', 2, 'att-admin@test');

-- === The catalogue: RLS, policies, grants ======================================

do $$
declare
  t text;
  fn text;
  grantee text;
  cmd text;
  bad text;
begin
  foreach t in array array[
    'assessment_config', 'assessment_items', 'assessment_attempts',
    'assessment_messages', 'assessment_unlocks', 'assessment_audit'
  ] loop
    if not (select c.relrowsecurity from pg_catalog.pg_class c where c.oid = ('public.' || t)::regclass) then
      raise exception 'ATTESTATION FAIL: RLS is not enabled on %', t;
    end if;

    -- The safety net: exactly one restrictive policy, admin-only, for
    -- authenticated, on every command.
    if (select count(*) from pg_catalog.pg_policies p
          where p.schemaname = 'public' and p.tablename = t and p.permissive = 'RESTRICTIVE'
            and p.cmd = 'ALL' and p.roles = '{authenticated}'
            and p.qual like '%is_admin()%' and p.with_check like '%is_admin()%') <> 1 then
      raise exception 'ATTESTATION FAIL: % has no restrictive admin-only policy', t;
    end if;

    -- No policy a non-admin could pass: every one asks is_admin() and nothing
    -- else can widen it, and none names anon or public.
    select string_agg(p.policyname, ', ') into bad
    from pg_catalog.pg_policies p
    where p.schemaname = 'public' and p.tablename = t
      and (
        p.roles <> '{authenticated}'
        or coalesce(p.qual, p.with_check) not like '%is_admin()%'
        or (p.with_check is not null and p.with_check not like '%is_admin()%')
      );
    if bad is not null then
      raise exception 'ATTESTATION FAIL: % has a policy that is not admin-only: %', t, bad;
    end if;

    -- anon: nothing at all.
    foreach cmd in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
      if has_table_privilege('anon', 'public.' || t, cmd) then
        raise exception 'ATTESTATION FAIL: anon holds % on %', cmd, t;
      end if;
    end loop;

    -- A session (authenticated) and the service role never delete a
    -- candidate's row or truncate anything; nobody but the owner touches the
    -- audit.
    foreach grantee in array array['authenticated', 'service_role'] loop
      if has_table_privilege(grantee, 'public.' || t, 'TRUNCATE') then
        raise exception 'ATTESTATION FAIL: % holds TRUNCATE on %', grantee, t;
      end if;
      if (t <> 'assessment_items' or grantee = 'service_role')
         and has_table_privilege(grantee, 'public.' || t, 'DELETE') then
        raise exception 'ATTESTATION FAIL: % holds DELETE on %', grantee, t;
      end if;
    end loop;
  end loop;

  -- The admin's session reads everything and writes only items and config.
  foreach t in array array['assessment_attempts', 'assessment_messages', 'assessment_unlocks', 'assessment_audit'] loop
    if not has_table_privilege('authenticated', 'public.' || t, 'SELECT') then
      raise exception 'ATTESTATION FAIL: authenticated cannot SELECT % (missing GRANT)', t;
    end if;
    if has_table_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || t, 'INSERT')
       or has_any_column_privilege('authenticated', 'public.' || t, 'UPDATE') then
      raise exception 'ATTESTATION FAIL: authenticated holds a write privilege on %', t;
    end if;
  end loop;
  if has_column_privilege('authenticated', 'public.assessment_config', 'version', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assessment_config', 'updated_by', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assessment_config', 'id', 'UPDATE')
     or not has_column_privilege('authenticated', 'public.assessment_config', 'weights', 'UPDATE')
     or has_table_privilege('authenticated', 'public.assessment_config', 'INSERT')
     or has_table_privilege('authenticated', 'public.assessment_config', 'DELETE') then
    raise exception 'ATTESTATION FAIL: authenticated''s config grants are not UPDATE of the six settings columns only';
  end if;
  if has_column_privilege('authenticated', 'public.assessment_items', 'id', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assessment_items', 'version', 'UPDATE')
     or has_column_privilege('authenticated', 'public.assessment_items', 'version', 'INSERT')
     or has_column_privilege('authenticated', 'public.assessment_items', 'updated_by', 'INSERT')
     or not has_column_privilege('authenticated', 'public.assessment_items', 'answer_key', 'UPDATE')
     or not has_table_privilege('authenticated', 'public.assessment_items', 'DELETE') then
    raise exception 'ATTESTATION FAIL: authenticated''s item grants are not the content columns only';
  end if;

  -- The service role (S05): reads, starts and advances attempts, appends
  -- messages — and nothing that moves an attempt to another person, rewrites
  -- its drawn items, overrides a score, or reads the audit.
  if has_table_privilege('service_role', 'public.assessment_audit', 'SELECT')
     or has_any_column_privilege('service_role', 'public.assessment_audit', 'INSERT') then
    raise exception 'ATTESTATION FAIL: service_role can read or write assessment_audit';
  end if;
  foreach cmd in array array['user_email', 'day', 'attempt_no', 'item_ids', 'served_items', 'override_score',
                             'override_note', 'overridden_by', 'overridden_at', 'version', 'id'] loop
    if has_column_privilege('service_role', 'public.assessment_attempts', cmd, 'UPDATE') then
      raise exception 'ATTESTATION FAIL: service_role may UPDATE assessment_attempts.%', cmd;
    end if;
  end loop;
  foreach cmd in array array['override_score', 'override_note', 'status', 'day_score', 'version'] loop
    if has_column_privilege('service_role', 'public.assessment_attempts', cmd, 'INSERT') then
      raise exception 'ATTESTATION FAIL: service_role may INSERT assessment_attempts.%', cmd;
    end if;
  end loop;
  if not has_column_privilege('service_role', 'public.assessment_attempts', 'answers', 'UPDATE')
     or not has_column_privilege('service_role', 'public.assessment_attempts', 'user_email', 'INSERT')
     or not has_column_privilege('service_role', 'public.assessment_messages', 'content', 'INSERT')
     or has_any_column_privilege('service_role', 'public.assessment_messages', 'UPDATE')
     or has_any_column_privilege('service_role', 'public.assessment_unlocks', 'INSERT')
     or has_any_column_privilege('service_role', 'public.assessment_config', 'UPDATE') then
    raise exception 'ATTESTATION FAIL: service_role''s attempt / message / unlock / config grants are not what 0023 declares';
  end if;
  if has_sequence_privilege('authenticated', 'public.assessment_audit_id_seq', 'USAGE')
     or has_sequence_privilege('service_role', 'public.assessment_audit_id_seq', 'USAGE')
     or has_sequence_privilege('anon', 'public.assessment_audit_id_seq', 'USAGE') then
    raise exception 'ATTESTATION FAIL: an API role can use the audit''s identity sequence';
  end if;

  -- The functions: the four admin writes for authenticated only, retention for
  -- service_role only.
  foreach fn in array array[
    'public.admin_assessment_override(uuid, numeric, text, integer)',
    'public.admin_assessment_clear_override(uuid, text, integer)',
    'public.admin_assessment_reset(uuid, integer)',
    'public.admin_assessment_reset_person(text)',
    'public.admin_assessment_unlock(text, smallint)',
    'public.admin_purge_person_history(text)'
  ] loop
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'ATTESTATION FAIL: authenticated cannot execute % (missing GRANT)', fn;
    end if;
    if has_function_privilege('anon', fn, 'execute') or has_function_privilege('service_role', fn, 'execute') then
      raise exception 'ATTESTATION FAIL: anon or service_role can execute %', fn;
    end if;
    if not (select p.prosecdef and p.proconfig = array['search_path=""'] from pg_catalog.pg_proc p where p.oid = fn::regprocedure) then
      raise exception 'ATTESTATION FAIL: % is not SECURITY DEFINER with an empty search_path', fn;
    end if;
  end loop;
  -- The item validators run as whoever writes the row, the seed's service
  -- role included, which has no USAGE on schema private: none may call
  -- another private.* function.
  select string_agg(p.proname, ', ') into bad
  from pg_catalog.pg_proc p
  where p.oid in (
      'private.assessment_options_valid(jsonb)'::regprocedure,
      'private.assessment_answer_key_valid(jsonb, text[])'::regprocedure,
      'private.assessment_item_publishable(text, text, text, jsonb, text[], text, text)'::regprocedure
    )
    and p.prosrc ~* 'private\s*\.\s*"?[a-z_][a-z0-9_]*"?\s*\(';
  if bad is not null then
    raise exception 'ATTESTATION FAIL: % call(s) another private function — a service-role write (the seed) would fail with "permission denied for schema private"', bad;
  end if;

  if not has_function_privilege('service_role', 'public.run_assessment_retention(boolean)', 'execute')
     or has_function_privilege('authenticated', 'public.run_assessment_retention(boolean)', 'execute')
     or has_function_privilege('anon', 'public.run_assessment_retention(boolean)', 'execute') then
    raise exception 'ATTESTATION FAIL: run_assessment_retention() is not service_role-only';
  end if;
  if has_function_privilege('authenticated', 'private.assessment_admin_actor(text)', 'execute') then
    raise exception 'ATTESTATION FAIL: authenticated can execute private.assessment_admin_actor()';
  end if;
end $$;

-- === As an operator, a sales manager and a claim-less token ====================
-- Zero rows everywhere — their own attempts included — no write of any kind,
-- and WT403 from every admin function before it reads anything.

set local role authenticated;

do $$
declare
  ident record;
  c record;
  n bigint;
  call record;
begin
  for ident in
    select * from (values
      ('operator', '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"att-op@test","app_metadata":{"role":"operator"}}'),
      ('sales manager', '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated","email":"att-mgr@test","app_metadata":{"role":"manager"}}'),
      ('claim-less token', '{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated","email":"att-op@test"}')
    ) as t(label, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);
    if current_user <> 'authenticated' or private.is_admin() then
      raise exception 'ATTESTATION FAIL: setup — expected a non-admin authenticated session for the %', ident.label;
    end if;

    for c in
      select * from (values
        ('assessment_config', 'assessment_config', 'true'),
        ('assessment_items', 'assessment_items', 'true'),
        ('published assessment_items', 'assessment_items', 'status = ''published'''),
        ('assessment_attempts', 'assessment_attempts', 'true'),
        ('their own assessment_attempts', 'assessment_attempts', 'user_email in (''att-op@test'', ''att-mgr@test'')'),
        ('assessment_messages', 'assessment_messages', 'true'),
        ('assessment_unlocks', 'assessment_unlocks', 'true'),
        ('assessment_audit', 'assessment_audit', 'true')
      ) as t(label, relation, filter)
    loop
      execute format('select count(*) from public.%I where %s', c.relation, c.filter) into n;
      if n <> 0 then
        raise exception 'ATTESTATION FAIL: the % can select % (% rows)', ident.label, c.label, n;
      end if;
    end loop;

    -- Writes: an INSERT is refused (no grant, or the admin-only WITH CHECK); an
    -- UPDATE / DELETE is refused or matches nothing.
    begin
      insert into public.assessment_items (id, day, topic, prompt) values ('att-test-member', 1, 'x', 'x');
      raise exception 'ATTESTATION FAIL: the % can INSERT an item', ident.label;
    exception when insufficient_privilege then null;
    end;
    update public.assessment_items set prompt = 'hacked' where id = 'att-test-single';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'ATTESTATION FAIL: the % can UPDATE an item', ident.label; end if;
    delete from public.assessment_items where id = 'att-test-draft';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'ATTESTATION FAIL: the % can DELETE an item', ident.label; end if;
    update public.assessment_config set retention_days = 30 where id = 1;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'ATTESTATION FAIL: the % can UPDATE the config', ident.label; end if;

    begin
      insert into public.assessment_attempts (user_email, day) values ('att-op@test', 3);
      raise exception 'ATTESTATION FAIL: the % can INSERT an attempt', ident.label;
    exception when insufficient_privilege then null;
    end;
    begin
      update public.assessment_attempts set status = 'evaluated', day_score = 100 where user_email = 'att-op@test';
      raise exception 'ATTESTATION FAIL: the % can UPDATE an attempt', ident.label;
    exception when insufficient_privilege then null;
    end;
    begin
      delete from public.assessment_attempts where user_email = 'att-op@test';
      raise exception 'ATTESTATION FAIL: the % can DELETE an attempt', ident.label;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.assessment_messages (attempt_id, seq, role, content)
      values ('a0000000-0000-4000-8000-000000000002', 1, 'operator', 'x');
      raise exception 'ATTESTATION FAIL: the % can INSERT a message', ident.label;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.assessment_unlocks (user_email, day, unlocked_by) values ('att-op@test', 3, 'me');
      raise exception 'ATTESTATION FAIL: the % can INSERT an unlock', ident.label;
    exception when insufficient_privilege then null;
    end;
    begin
      insert into public.assessment_audit (actor, action) values ('me', 'unlock');
      raise exception 'ATTESTATION FAIL: the % can INSERT an audit row', ident.label;
    exception when insufficient_privilege then null;
    end;

    for call in
      select * from (values
        ('admin_assessment_override', 'select public.admin_assessment_override(''a0000000-0000-4000-8000-000000000001'', 100, ''x'', 1)'),
        ('admin_assessment_clear_override', 'select public.admin_assessment_clear_override(''a0000000-0000-4000-8000-000000000001'', ''x'', 1)'),
        ('admin_assessment_reset', 'select public.admin_assessment_reset(''a0000000-0000-4000-8000-000000000001'')'),
        ('admin_assessment_reset_person', 'select public.admin_assessment_reset_person(''att-op@test'')'),
        ('admin_assessment_unlock', 'select public.admin_assessment_unlock(''att-op@test'', 3::smallint)')
      ) as t(fn, sql)
    loop
      begin
        execute call.sql;
        raise exception 'ATTESTATION FAIL: the % can call %()', ident.label, call.fn;
      exception when others then
        if sqlstate <> 'WT403' then
          raise exception 'ATTESTATION FAIL: the % calling %() got % (%), expected WT403', ident.label, call.fn, sqlstate, sqlerrm;
        end if;
      end;
    end loop;

    begin
      perform * from public.run_assessment_retention();
      raise exception 'ATTESTATION FAIL: the % can run the attestation retention', ident.label;
    exception when insufficient_privilege then null;
    end;
  end loop;
end $$;

-- The safety net holds: even with a permissive "everyone reads everything"
-- policy added by mistake, the restrictive admin-only one keeps every row from
-- an operator. (The policy is created by the editor's own role and rolled back
-- with everything else.)
reset role;
create policy "att_test_mistake" on public.assessment_attempts for select to authenticated using (true);
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated","email":"att-op@test","app_metadata":{"role":"operator"}}';

do $$
begin
  if (select count(*) from public.assessment_attempts) <> 0 then
    raise exception 'ATTESTATION FAIL: a permissive policy added by mistake exposes attempts to an operator — the restrictive policy is missing';
  end if;
end $$;

reset role;
drop policy "att_test_mistake" on public.assessment_attempts;
set local role authenticated;

-- === A stale admin token ========================================================
-- The claim says admin, the allow-list does not (the row is inactive): every
-- admin function reads the caller's row under the allow-list lock — WT403.

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated","email":"att-admin-off@test","app_metadata":{"role":"admin"}}';

do $$
declare
  call record;
begin
  for call in
    select * from (values
      ('admin_assessment_override', 'select public.admin_assessment_override(''a0000000-0000-4000-8000-000000000001'', 100, ''x'', 1)'),
      ('admin_assessment_clear_override', 'select public.admin_assessment_clear_override(''a0000000-0000-4000-8000-000000000001'', ''x'', 1)'),
      ('admin_assessment_reset', 'select public.admin_assessment_reset(''a0000000-0000-4000-8000-000000000001'')'),
      ('admin_assessment_reset_person', 'select public.admin_assessment_reset_person(''att-op@test'')'),
      ('admin_assessment_unlock', 'select public.admin_assessment_unlock(''att-op@test'', 3::smallint)')
    ) as t(fn, sql)
  loop
    begin
      execute call.sql;
      raise exception 'ATTESTATION FAIL: a stale admin token can call %()', call.fn;
    exception when sqlstate 'WT403' then null;
    end;
  end loop;
end $$;

-- === As the admin =================================================================

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated","email":"att-admin@test","app_metadata":{"role":"admin"}}';

-- Reads: everything.
do $$
begin
  if not private.is_admin() then
    raise exception 'ATTESTATION FAIL: setup — the admin claim is not admin';
  end if;
  if (select count(*) from public.assessment_attempts where user_email like 'att-%@test') <> 4
     or (select count(*) from public.assessment_messages where attempt_id::text like 'a0000000-%') <> 3
     or (select count(*) from public.assessment_unlocks where user_email = 'att-op-2@test') <> 1
     or (select count(*) from public.assessment_items where id like 'att-test-%') <> 3
     or (select count(*) from public.assessment_config) <> 1 then
    raise exception 'ATTESTATION FAIL: the admin cannot read every fixture row';
  end if;
  perform count(*) from public.assessment_audit;
end $$;

-- Items: version-guarded, checked, audited.
do $$
declare
  audit_before bigint;
  n bigint;
  v integer;
begin
  select count(*) into audit_before from public.assessment_audit;

  insert into public.assessment_items (id, day, topic, kind, difficulty, prompt, options, answer_key)
  values ('att-test-new', 3, 'funnel', 'single', 2, 'Yangi savol',
          '[{"id":"a","text":"Ha","text_ru":null},{"id":"b","text":"Yo''q","text_ru":null}]', '{a}');
  if (select a.action || '/' || a.actor from public.assessment_audit a
        where a.item_id = 'att-test-new' order by a.id desc limit 1) is distinct from 'item_create/att-admin@test' then
    raise exception 'ATTESTATION FAIL: creating an item did not write an item_create audit row with the admin as actor';
  end if;
  if (select updated_by from public.assessment_items where id = 'att-test-new') is distinct from 'att-admin@test' then
    raise exception 'ATTESTATION FAIL: updated_by is not stamped from the JWT';
  end if;

  -- Publishing without Russian text: refused by the database's own rules.
  begin
    update public.assessment_items set status = 'published' where id = 'att-test-new';
    raise exception 'ATTESTATION FAIL: an item without Russian text can be published';
  exception when check_violation then null;
  end;

  -- The publish rules, one at a time (each on an otherwise publishable row).
  begin
    update public.assessment_items set answer_key = '{a,b}' where id = 'att-test-single';
    raise exception 'ATTESTATION FAIL: a single-choice item can be published with two keys';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items set answer_key = '{}' where id = 'att-test-multi';
    raise exception 'ATTESTATION FAIL: a multi-choice item can be published with no key';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items set answer_key = '{z}' where id = 'att-test-draft';
    raise exception 'ATTESTATION FAIL: an answer key naming no option was stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items
    set options = '[{"id":"a","text":"PPR","text_ru":"ППР"},{"id":"b","text":" PPR ","text_ru":"Канализация"}]', answer_key = '{a}'
    where id = 'att-test-multi';
    raise exception 'ATTESTATION FAIL: two options with the same text can be published';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items set prompt = repeat('x', 401) where id = 'att-test-single';
    raise exception 'ATTESTATION FAIL: a 401-character prompt can be published';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items
    set options = '[{"id":"a","text":"1 yil","text_ru":"1 год"}]', answer_key = '{a}'
    where id = 'att-test-single';
    raise exception 'ATTESTATION FAIL: a one-option item can be published';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items set explanation_ru = null where id = 'att-test-single';
    raise exception 'ATTESTATION FAIL: an item with an explanation in one language only can be published';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_items set options = '[{"id":"A!","text":"x"}]' where id = 'att-test-draft';
    raise exception 'ATTESTATION FAIL: a malformed option was stored';
  exception when check_violation then null;
  end;

  -- The version column is the trigger's, not the writer's.
  begin
    update public.assessment_items set version = 99 where id = 'att-test-new';
    raise exception 'ATTESTATION FAIL: a session can write assessment_items.version';
  exception when insufficient_privilege then null;
  end;

  -- A complete item publishes; the version moves by one per update, and a
  -- write guarded on the old version matches nothing.
  select version into v from public.assessment_items where id = 'att-test-new';
  update public.assessment_items
  set prompt_ru = 'Новый вопрос',
      options = '[{"id":"a","text":"Ha","text_ru":"Да"},{"id":"b","text":"Yo''q","text_ru":"Нет"}]',
      status = 'published'
  where id = 'att-test-new' and version = v;
  get diagnostics n = row_count;
  if n <> 1 or (select version from public.assessment_items where id = 'att-test-new') <> v + 1 then
    raise exception 'ATTESTATION FAIL: publishing a complete item did not update it once and bump its version';
  end if;
  if (select a.action from public.assessment_audit a where a.item_id = 'att-test-new' order by a.id desc limit 1)
     is distinct from 'item_publish' then
    raise exception 'ATTESTATION FAIL: publishing did not write an item_publish audit row';
  end if;
  update public.assessment_items set topic = 'stale-write' where id = 'att-test-new' and version = v;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'ATTESTATION FAIL: a write guarded on a stale version changed the item';
  end if;

  -- An update that changes nothing is not an event.
  select count(*) into n from public.assessment_audit;
  update public.assessment_items set topic = topic where id = 'att-test-new';
  if (select count(*) from public.assessment_audit) <> n then
    raise exception 'ATTESTATION FAIL: a no-op item update wrote an audit row';
  end if;

  update public.assessment_items set status = 'draft' where id = 'att-test-new';
  delete from public.assessment_items where id = 'att-test-new';
  if (select array_agg(a.action order by a.id) from public.assessment_audit a
        where a.item_id = 'att-test-new' and a.id > (select max(b.id) - 2 from public.assessment_audit b))
     is distinct from array['item_unpublish', 'item_delete'] then
    raise exception 'ATTESTATION FAIL: unpublish and delete were not audited as item_unpublish, item_delete';
  end if;

  -- The audit names what changed, never the answer key.
  if exists (select 1 from public.assessment_audit a where a.details::text like '%answer_key":%[%') then
    raise exception 'ATTESTATION FAIL: an audit row carries an answer key';
  end if;
  if (select count(*) from public.assessment_audit) <= audit_before then
    raise exception 'ATTESTATION FAIL: item writes were not audited';
  end if;
end $$;

-- Config: version-guarded, every JSON shape checked, audited.
do $$
declare
  v integer;
  n bigint;
begin
  select version into v from public.assessment_config where id = 1;

  begin
    update public.assessment_config
    set weights = jsonb_set(weights, '{1,partA}', '30') where id = 1;
    raise exception 'ATTESTATION FAIL: weights that do not sum to 100 were stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_config set thresholds = '{"green": 60, "yellow": 60}' where id = 1;
    raise exception 'ATTESTATION FAIL: yellow = green was stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_config set thresholds = '{"green": 80, "yellow": 60, "blue": 1}' where id = 1;
    raise exception 'ATTESTATION FAIL: an unknown threshold key was stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_config set day_settings = jsonb_set(day_settings, '{2,maxTurns}', '3') where id = 1;
    raise exception 'ATTESTATION FAIL: maxTurns below minTurns was stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_config set day_settings = jsonb_set(day_settings, '{3,itemSeconds}', '"60"') where id = 1;
    raise exception 'ATTESTATION FAIL: a string where a number belongs was stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_config set extra_facts = repeat('x', 8001) where id = 1;
    raise exception 'ATTESTATION FAIL: 8001 characters of extra facts were stored';
  exception when check_violation then null;
  end;
  begin
    update public.assessment_config set retention_days = 10 where id = 1;
    raise exception 'ATTESTATION FAIL: a 10-day retention was stored';
  exception when check_violation then null;
  end;

  update public.assessment_config
  set thresholds = '{"green": 85, "yellow": 65}', extra_facts = 'Zavod quvvati: sutkasiga 40 tonna.'
  where id = 1 and version = v;
  get diagnostics n = row_count;
  if n <> 1 or (select version from public.assessment_config where id = 1) <> v + 1 then
    raise exception 'ATTESTATION FAIL: a config update did not apply once and bump the version';
  end if;
  if (select a.details -> 'changed' from public.assessment_audit a where a.action = 'config_update' order by a.id desc limit 1)
     is distinct from '["thresholds", "extra_facts"]'::jsonb then
    raise exception 'ATTESTATION FAIL: the config update was not audited with what changed';
  end if;
  update public.assessment_config set retention_days = 100 where id = 1 and version = v;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'ATTESTATION FAIL: a config write guarded on a stale version applied';
  end if;
end $$;

-- Attempts, messages, unlocks and the audit: never written by the session
-- directly, the admin's included.
do $$
begin
  begin
    update public.assessment_attempts set day_score = 100 where id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'ATTESTATION FAIL: an admin session can UPDATE an attempt directly';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assessment_audit (actor, action) values ('forged', 'override');
    raise exception 'ATTESTATION FAIL: an admin session can forge an audit row';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.assessment_unlocks (user_email, day, unlocked_by) values ('att-op@test', 4, 'att-admin@test');
    raise exception 'ATTESTATION FAIL: an admin session can INSERT an unlock directly';
  exception when insufficient_privilege then null;
  end;
end $$;

-- Override.
do $$
declare
  v integer;
  nv integer;
  a record;
begin
  select version into v from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000001';

  -- Refusals first: nothing is written by any of them.
  begin
    perform public.admin_assessment_override('a0000000-0000-4000-8000-000000000001', 101, 'too high', v);
    raise exception 'ATTESTATION FAIL: an override of 101 was accepted';
  exception when sqlstate 'WT400' then null;
  end;
  begin
    perform public.admin_assessment_override('a0000000-0000-4000-8000-000000000001', 80, '   ', v);
    raise exception 'ATTESTATION FAIL: an override without a note was accepted';
  exception when sqlstate 'WT400' then null;
  end;
  begin
    perform public.admin_assessment_override('a0000000-0000-4000-8000-00000000ffff', 80, 'note', 1);
    raise exception 'ATTESTATION FAIL: an override of a missing attempt was accepted';
  exception when sqlstate 'WT404' then null;
  end;
  begin
    perform public.admin_assessment_override('a0000000-0000-4000-8000-000000000001', 80, 'note', v + 1);
    raise exception 'ATTESTATION FAIL: an override on a stale version was accepted';
  exception when sqlstate 'WT409' then null;
  end;
  begin
    perform public.admin_assessment_override('a0000000-0000-4000-8000-000000000002', 80, 'note',
      (select version from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000002'));
    raise exception 'ATTESTATION FAIL: an attempt still being taken can be overridden';
  exception when sqlstate 'WT409' then null;
  end;
  begin
    perform public.admin_assessment_override('a0000000-0000-4000-8000-000000000001', null, 'no score', v);
    raise exception 'ATTESTATION FAIL: an override without a score was accepted';
  exception when sqlstate 'WT400' then null;
  end;
  begin
    perform public.admin_assessment_clear_override('a0000000-0000-4000-8000-000000000001', 'clear nothing', v);
    raise exception 'ATTESTATION FAIL: clearing an override that does not exist was accepted';
  exception when sqlstate 'WT409' then null;
  end;

  nv := public.admin_assessment_override('a0000000-0000-4000-8000-000000000001', 72.456, 'Qo''ng''iroq yozuvi tekshirildi', v);
  select * into a from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000001';
  if nv <> v + 1 or a.version <> nv or a.override_score <> 72.46 or a.overridden_by <> 'att-admin@test'
     or a.override_note <> 'Qo''ng''iroq yozuvi tekshirildi' or a.overridden_at is null or a.day_score <> 89.8 then
    raise exception 'ATTESTATION FAIL: the override did not set score / note / who / when (and keep day_score): %', row_to_json(a);
  end if;
  if (select jsonb_build_object('action', x.action, 'target', x.target_email, 'computed', x.details -> 'computed', 'score', x.details -> 'score')
        from public.assessment_audit x where x.attempt_id = 'a0000000-0000-4000-8000-000000000001' order by x.id desc limit 1)
     is distinct from '{"action": "override", "target": "att-op@test", "computed": 89.8, "score": 72.46}'::jsonb then
    raise exception 'ATTESTATION FAIL: the override was not audited with the computed and the new score';
  end if;

  -- Clearing, with a note of its own, guarded like the override.
  begin
    perform public.admin_assessment_clear_override('a0000000-0000-4000-8000-000000000001', 'Xato kiritilgan', nv - 1);
    raise exception 'ATTESTATION FAIL: clearing on a stale version was accepted';
  exception when sqlstate 'WT409' then null;
  end;
  begin
    perform public.admin_assessment_clear_override('a0000000-0000-4000-8000-000000000001', '', nv);
    raise exception 'ATTESTATION FAIL: clearing without a note was accepted';
  exception when sqlstate 'WT400' then null;
  end;
  nv := public.admin_assessment_clear_override('a0000000-0000-4000-8000-000000000001', 'Xato kiritilgan', nv);
  select * into a from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000001';
  if a.override_score is not null or a.override_note is not null or a.overridden_by is not null or a.overridden_at is not null then
    raise exception 'ATTESTATION FAIL: clearing the override left a column set';
  end if;
  if (select x.action from public.assessment_audit x where x.attempt_id = 'a0000000-0000-4000-8000-000000000001' order by x.id desc limit 1)
     is distinct from 'override_clear' then
    raise exception 'ATTESTATION FAIL: clearing was not audited as override_clear';
  end if;
end $$;

-- Reset: archives, allows a second attempt, refuses an archived one; the
-- partial unique index allows one open attempt per (person, day).
do $$
declare
  v integer;
begin
  select version into v from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000003';
  begin
    perform public.admin_assessment_reset('a0000000-0000-4000-8000-000000000003', v + 5);
    raise exception 'ATTESTATION FAIL: a reset on a stale version was accepted';
  exception when sqlstate 'WT409' then null;
  end;
  begin
    perform public.admin_assessment_reset('a0000000-0000-4000-8000-00000000ffff');
    raise exception 'ATTESTATION FAIL: a reset of a missing attempt was accepted';
  exception when sqlstate 'WT404' then null;
  end;

  perform public.admin_assessment_reset('a0000000-0000-4000-8000-000000000003', v);
  if (select status from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000003') <> 'archived' then
    raise exception 'ATTESTATION FAIL: the reset attempt is not archived';
  end if;
  if (select x.action || '/' || (x.details ->> 'previous_status') from public.assessment_audit x
        where x.attempt_id = 'a0000000-0000-4000-8000-000000000003' order by x.id desc limit 1)
     is distinct from 'reset/submitted' then
    raise exception 'ATTESTATION FAIL: the reset was not audited with the previous status';
  end if;

  begin
    perform public.admin_assessment_reset('a0000000-0000-4000-8000-000000000003');
    raise exception 'ATTESTATION FAIL: an archived attempt can be reset again';
  exception when sqlstate 'WT409' then null;
  end;
end $$;

-- The second attempt of the day and the one-open-attempt rule — written the
-- way S05 will, as the service role. Schema USAGE is checked when a statement
-- is planned, and the admin's writes above left the validators' plans cached
-- in this session: discard them, so the service role's writes below are
-- planned — and checked — as the service role.
reset role;
discard plans;
set local role service_role;
set local request.jwt.claims = '{"role":"service_role"}';

do $$
begin
  insert into public.assessment_attempts (user_email, day, attempt_no, item_ids)
  values ('att-mgr@test', 1, 2, '{att-test-single}');

  begin
    insert into public.assessment_attempts (user_email, day, attempt_no) values ('att-mgr@test', 1, 3);
    raise exception 'ATTESTATION FAIL: two open attempts of one day were stored';
  exception when unique_violation then null;
  end;

  -- The service role's own limits: it cannot hand an attempt to someone else,
  -- change its items, override, delete, or read the audit.
  begin
    update public.assessment_attempts set user_email = 'att-op@test' where user_email = 'att-mgr@test';
    raise exception 'ATTESTATION FAIL: the service role can move an attempt to another person';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assessment_attempts set override_score = 100 where user_email = 'att-mgr@test';
    raise exception 'ATTESTATION FAIL: the service role can write an override';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.assessment_attempts set item_ids = '{att-test-multi}' where user_email = 'att-mgr@test';
    raise exception 'ATTESTATION FAIL: the service role can change an attempt''s drawn items';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.assessment_attempts where user_email = 'att-mgr@test';
    raise exception 'ATTESTATION FAIL: the service role can delete an attempt';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.assessment_audit;
    raise exception 'ATTESTATION FAIL: the service role can read the audit';
  exception when insufficient_privilege then null;
  end;

  -- The staging seed writes the bank as the service role: a draft insert, then
  -- what --force's upsert does. The item CHECKs must hold for this writer too —
  -- none may call another private.* function, which would need USAGE on the
  -- schema (service_role has none) and fail the write with 42501.
  insert into public.assessment_items (id, day, topic, kind, difficulty, prompt, prompt_ru, options, answer_key, status)
  values ('att-test-seed', 2, 'sizes', 'single', 1, 'Seed?', 'Сид?',
          '[{"id":"a","text":"Ha","text_ru":"Да"},{"id":"b","text":"Yo''q","text_ru":"Нет"}]', '{a}', 'draft')
  on conflict (id) do nothing;
  update public.assessment_items set status = 'published' where id = 'att-test-seed';
  update public.assessment_items set status = 'draft' where id = 'att-test-seed';

  -- What it may do: advance an attempt and append the transcript.
  update public.assessment_attempts
  set phase = 'part_b', part_a_finished_at = now(), answers = '{"att-test-single": {"chosen": ["b"]}}'
  where user_email = 'att-mgr@test' and attempt_no = 2;
  insert into public.assessment_messages (attempt_id, seq, role, content)
  select id, 1, 'customer', 'Salom!' from public.assessment_attempts where user_email = 'att-mgr@test' and attempt_no = 2;

  -- An operator message is at most 600 characters, a customer's 2000.
  begin
    insert into public.assessment_messages (attempt_id, seq, role, content)
    select id, 2, 'operator', repeat('x', 601) from public.assessment_attempts where user_email = 'att-mgr@test' and attempt_no = 2;
    raise exception 'ATTESTATION FAIL: a 601-character operator message was stored';
  exception when check_violation then null;
  end;
  insert into public.assessment_messages (attempt_id, seq, role, content)
  select id, 2, 'operator', repeat('x', 600) from public.assessment_attempts where user_email = 'att-mgr@test' and attempt_no = 2;

  -- The transcript is append-only.
  begin
    update public.assessment_messages set content = 'edited' where seq = 1 and attempt_id in
      (select id from public.assessment_attempts where user_email = 'att-mgr@test' and attempt_no = 2);
    raise exception 'ATTESTATION FAIL: a message can be edited';
  exception when insufficient_privilege then null;
  end;

  if (select version from public.assessment_attempts where user_email = 'att-mgr@test' and attempt_no = 2) <> 2 then
    raise exception 'ATTESTATION FAIL: a service-role update did not bump the attempt version';
  end if;
end $$;

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated","email":"att-admin@test","app_metadata":{"role":"admin"}}';

-- Unlock.
do $$
declare
  audit_rows bigint;
begin
  if not public.admin_assessment_unlock(' ATT-OP@test ', 3::smallint) then
    raise exception 'ATTESTATION FAIL: unlocking day 3 for an operator did not record an unlock';
  end if;
  if (select x.action || '/' || x.target_email || '/' || x.day from public.assessment_audit x order by x.id desc limit 1)
     is distinct from 'unlock/att-op@test/3' then
    raise exception 'ATTESTATION FAIL: the unlock was not audited';
  end if;
  select count(*) into audit_rows from public.assessment_audit;
  if public.admin_assessment_unlock('att-op@test', 3::smallint) then
    raise exception 'ATTESTATION FAIL: a repeated unlock reported a new one';
  end if;
  if (select count(*) from public.assessment_audit) <> audit_rows then
    raise exception 'ATTESTATION FAIL: a repeated unlock wrote an audit row';
  end if;
  if not public.admin_assessment_unlock('att-mgr@test', 4::smallint) then
    raise exception 'ATTESTATION FAIL: a sales manager cannot be given an unlock';
  end if;

  begin
    perform public.admin_assessment_unlock('att-op@test', 1::smallint);
    raise exception 'ATTESTATION FAIL: day 1 can be unlocked';
  exception when sqlstate 'WT400' then null;
  end;
  begin
    perform public.admin_assessment_unlock('att-op@test', 5::smallint);
    raise exception 'ATTESTATION FAIL: day 5 can be unlocked';
  exception when sqlstate 'WT400' then null;
  end;
  begin
    perform public.admin_assessment_unlock('att-admin-2@test', 2::smallint);
    raise exception 'ATTESTATION FAIL: an admin can be given an unlock';
  exception when sqlstate 'WT404' then null;
  end;
  begin
    perform public.admin_assessment_unlock('att-nobody@test', 2::smallint);
    raise exception 'ATTESTATION FAIL: an email that is not on the allow-list can be given an unlock';
  exception when sqlstate 'WT404' then null;
  end;
end $$;

-- Reset a person: every open attempt archived, every unlock gone, one audit
-- row; a second reset changes nothing and writes nothing.
do $$
declare
  result jsonb;
  audit_rows bigint;
begin
  result := public.admin_assessment_reset_person('ATT-OP@test');
  if result is distinct from '{"attempts_archived": 2, "unlocks_removed": 1}'::jsonb then
    raise exception 'ATTESTATION FAIL: admin_assessment_reset_person returned %, expected 2 archived and 1 unlock removed', result;
  end if;
  if exists (select 1 from public.assessment_attempts where user_email = 'att-op@test' and status <> 'archived')
     or exists (select 1 from public.assessment_unlocks where user_email = 'att-op@test') then
    raise exception 'ATTESTATION FAIL: the person reset left an open attempt or an unlock';
  end if;
  if (select x.action from public.assessment_audit x order by x.id desc limit 1) is distinct from 'reset_person' then
    raise exception 'ATTESTATION FAIL: the person reset was not audited';
  end if;
  select count(*) into audit_rows from public.assessment_audit;
  result := public.admin_assessment_reset_person('att-op@test');
  if result is distinct from '{"attempts_archived": 0, "unlocks_removed": 0}'::jsonb
     or (select count(*) from public.assessment_audit) <> audit_rows then
    raise exception 'ATTESTATION FAIL: a reset that changed nothing reported % or wrote an audit row', result;
  end if;
  begin
    perform public.admin_assessment_reset_person('  ');
    raise exception 'ATTESTATION FAIL: a person reset without an email was accepted';
  exception when sqlstate 'WT400' then null;
  end;
end $$;

-- The purge (0022, attestation since 0023): the person's attempts, their
-- messages and unlocks go, with counts; nobody else's; never the audit.
do $$
declare
  purged jsonb;
  audit_rows bigint;
begin
  select count(*) into audit_rows from public.assessment_audit;
  purged := public.admin_purge_person_history(' Att-Op-2@TEST ');
  if purged - array['telemetry', 'user_state', 'copilot']
     is distinct from '{"assessment_attempts": 1, "assessment_messages": 2, "assessment_unlocks": 1}'::jsonb then
    raise exception 'ATTESTATION FAIL: the purge returned %, expected 1 attempt, 2 messages, 1 unlock', purged;
  end if;
  if exists (select 1 from public.assessment_attempts where user_email = 'att-op-2@test')
     or exists (select 1 from public.assessment_messages where attempt_id = 'a0000000-0000-4000-8000-000000000004')
     or exists (select 1 from public.assessment_unlocks where user_email = 'att-op-2@test') then
    raise exception 'ATTESTATION FAIL: the purge left attestation rows of the purged person';
  end if;
  if (select count(*) from public.assessment_attempts where user_email in ('att-op@test', 'att-mgr@test')) <> 4
     or (select count(*) from public.assessment_messages where attempt_id = 'a0000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'ATTESTATION FAIL: the purge deleted somebody else''s attestation rows';
  end if;
  if (select count(*) from public.assessment_audit) <> audit_rows then
    raise exception 'ATTESTATION FAIL: the purge wrote to or deleted from assessment_audit';
  end if;
end $$;

-- === The audit is append-only, even for the owner ================================

reset role;
set local request.jwt.claims = '';

do $$
begin
  begin
    update public.assessment_audit set actor = 'rewritten' where actor = 'att-admin@test';
    raise exception 'ATTESTATION FAIL: the owner can UPDATE assessment_audit';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.assessment_audit where actor = 'att-admin@test';
    raise exception 'ATTESTATION FAIL: the owner can DELETE from assessment_audit';
  exception when insufficient_privilege then null;
  end;
  begin
    truncate public.assessment_audit;
    raise exception 'ATTESTATION FAIL: the owner can TRUNCATE assessment_audit';
  exception when insufficient_privilege then null;
  end;
  -- The transcript, too: the service role has no UPDATE grant on it, and the
  -- trigger stops the owner as well.
  begin
    update public.assessment_messages set content = 'edited' where attempt_id = 'a0000000-0000-4000-8000-000000000001';
    raise exception 'ATTESTATION FAIL: the owner can edit a message';
  exception when insufficient_privilege then null;
  end;
end $$;

-- === Retention, as pg_cron would run it ===========================================

insert into public.assessment_attempts (id, user_email, day, attempt_no, status, started_at, submitted_at)
values
  ('a0000000-0000-4000-8000-000000000010', 'att-old@test', 1, 1, 'submitted', now() - interval '400 days', now() - interval '400 days'),
  ('a0000000-0000-4000-8000-000000000011', 'att-old@test', 2, 1, 'in_progress', now() - interval '300 days', null);
insert into public.assessment_messages (attempt_id, seq, role, content) values
  ('a0000000-0000-4000-8000-000000000010', 1, 'customer', 'Eski suhbat'),
  ('a0000000-0000-4000-8000-000000000010', 2, 'operator', 'Eski javob');
insert into public.assessment_unlocks (user_email, day, unlocked_by, unlocked_at) values
  ('att-old@test', 2, 'att-admin@test', now() - interval '400 days');

do $$
declare
  r record;
begin
  select * into strict r from public.run_assessment_retention();
  if r.skipped or r.window_days <> 365 or r.attempts_deleted < 1 or r.messages_deleted < 2 or r.unlocks_deleted < 1 then
    raise exception 'ATTESTATION FAIL: retention (365 days) reported %', row_to_json(r);
  end if;
  if exists (select 1 from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000010')
     or exists (select 1 from public.assessment_messages where attempt_id = 'a0000000-0000-4000-8000-000000000010')
     or exists (select 1 from public.assessment_unlocks where user_email = 'att-old@test') then
    raise exception 'ATTESTATION FAIL: retention left a 400-day-old attempt, its messages or its unlock';
  end if;
  if not exists (select 1 from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000011') then
    raise exception 'ATTESTATION FAIL: retention deleted a 300-day-old attempt under a 365-day window';
  end if;

  -- The window comes from the config.
  update public.assessment_config set retention_days = 200 where id = 1;
  select * into strict r from public.run_assessment_retention();
  if r.window_days <> 200 or exists (select 1 from public.assessment_attempts where id = 'a0000000-0000-4000-8000-000000000011') then
    raise exception 'ATTESTATION FAIL: retention did not follow retention_days = 200: %', row_to_json(r);
  end if;

  -- The app's call passes p_skip_if_scheduled: without pg_cron it runs (and a
  -- second run finds nothing of the fixture left); with pg_cron's job active
  -- it skips, deleting nothing.
  select * into strict r from public.run_assessment_retention(true);
  if to_regclass('cron.job') is null and (r.skipped or exists (
       select 1 from public.assessment_attempts where user_email = 'att-old@test')) then
    raise exception 'ATTESTATION FAIL: retention with p_skip_if_scheduled skipped without pg_cron: %', row_to_json(r);
  end if;
  if r.skipped and (r.attempts_deleted <> 0 or r.messages_deleted <> 0 or r.unlocks_deleted <> 0) then
    raise exception 'ATTESTATION FAIL: a skipped retention run reports deletions: %', row_to_json(r);
  end if;
end $$;

rollback;

select 'Attestation checks passed' as result;
