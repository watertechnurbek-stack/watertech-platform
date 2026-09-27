-- R4 / S04 — Attestatsiya: the four-day attestation (docs/ATTESTATION.md).
--
-- Every day a candidate (an operator or a sales manager) takes a knowledge
-- check (Part A) and then talks to an AI customer (Part B); the admin is the
-- only reader of any result. This file is the storage and the security
-- boundary for all of it. S05 builds the engine and the candidate API on top,
-- S06 the candidate UI, S07 the admin results UI.
--
--   public.assessment_config     the singleton (id = 1): weights, bands, day
--                                settings, the admin's extra facts, retention
--   public.assessment_items      the Part A item bank: draft / published
--   public.assessment_attempts   one attempt per (person, day, attempt_no)
--   public.assessment_messages   the Part B transcript, append-only
--   public.assessment_unlocks    days the admin opened without the waiting day
--   public.assessment_audit      every admin action, append-only
--
-- CONFIDENTIALITY — the first requirement. An operator or a sales manager may
-- learn per-day status only (locked / available / in progress / submitted),
-- never a score, a band, the rubric, an answer key or an evaluation state.
-- So on every table here:
--
--   * RLS is enabled, and the only permissive policies ask
--     (select private.is_admin()). There is NO policy an operator or a sales
--     manager passes. Grants are per Postgres role, and `authenticated` is
--     shared by all three app roles, so "no grant for operators" is realised as
--     "no row passes for them".
--   * A RESTRICTIVE policy `assessment_*_admin_only` for `authenticated`, too:
--     restrictive policies AND with the permissive ones, so a permissive policy
--     added by mistake later still opens nothing to a non-admin.
--   * `authenticated` holds no write privilege at all on attempts, messages,
--     unlocks and the audit.
--
-- How a candidate reaches their own attempt: only through Route Handlers
-- (app/api/attestation/**, S05) that verify the session, refuse an admin, and
-- then use the SERVICE-ROLE client with every query filtered by the session's
-- own email (lib/attestation/repository.ts, operatorAttestationRepo) — the same
-- justified pattern as copilot_logs in /api/copilot: the row's identity comes
-- from the verified session, never from a request body. A SELECT policy on the
-- candidate's own attempt would hand their browser every column of it over
-- PostgREST — scores, rubric, the answer-key snapshot. The service role's own
-- grants are narrowed too (Section 4): it can never move an attempt to another
-- person, write an override, or touch the audit.
--
-- ADMIN WRITES. Two patterns, each chosen for what it protects:
--
--   * Items and config — direct RLS writes with version guards, the CMS
--     pattern (CLAUDE.md §7): column grants, a trigger that bumps `version`,
--     CHECK constraints that hold every JSON shape and every publish rule, and
--     an AFTER trigger (SECURITY DEFINER) that writes the audit row — so the UI,
--     the SQL editor, the staging seed and a direct PostgREST call are audited
--     alike and none can skip it.
--   * Attempts and unlocks — five functions, SECURITY DEFINER:
--     admin_assessment_override, _clear_override, _reset, _reset_person,
--     _unlock. As INVOKER
--     they would need the admin session to hold UPDATE on attempts and INSERT
--     on unlocks and on assessment_audit — and then any admin session could
--     rewrite a score or forge an audit row straight over PostgREST, around
--     every check the function makes (0022's reasoning for
--     admin_purge_person_history). As DEFINER they are the only way in. Each:
--       WT403  the caller's claim is not admin (the first statement);
--       WT403  under the allow-list guard's advisory lock (0017), the caller's
--              own allow-list row is not an active admin (a stale admin token);
--       WT400  bad arguments;  WT404  no such attempt / person;
--       WT409  the attempt changed since the admin looked (version or state);
--     then one write and one assessment_audit row. None returns a score.
--
-- Also here: public.admin_purge_person_history (0022) re-created so a person
-- removal with history also deletes their attempts (messages cascade) and
-- unlocks; public.run_assessment_retention() — retention_days from the config,
-- service_role / pg_cron only; the default config row.
--
-- Re-running 0022 after this file puts back the purge WITHOUT the attestation
-- tables: re-run this file after it (attestation-checks.sql says so). Re-running
-- this file is safe: tables `if not exists`, functions `create or replace`,
-- triggers and policies dropped and re-created, grants revoked and re-granted,
-- the config row `on conflict do nothing` (the admin's settings survive).
--
-- APPLY ORDER (see docs/MIGRATIONS.md): after 0022. Run as `postgres` in the SQL
-- editor with role impersonation off: the SECURITY DEFINER functions must belong
-- to the owner of the tables they write (Section 10 checks it).

begin;

-- =============================================================================
-- Section 0 — preflight
-- =============================================================================

do $preflight$
declare
  missing text[] := '{}';
begin
  if to_regprocedure('private.is_admin()') is null then
    missing := missing || 'private.is_admin() (0020)'::text;
  end if;
  if to_regprocedure('public.admin_purge_person_history(text)') is null then
    missing := missing || 'public.admin_purge_person_history(text) (0022)'::text;
  end if;
  if to_regprocedure('public.set_updated_at()') is null then
    missing := missing || 'public.set_updated_at() (0002)'::text;
  end if;
  if to_regprocedure('public.stamp_content_actor()') is null then
    missing := missing || 'public.stamp_content_actor() (0013)'::text;
  end if;
  if to_regclass('public.allowed_users') is null then
    missing := missing || 'public.allowed_users (0013)'::text;
  end if;
  if to_regnamespace('private') is null then
    missing := missing || 'schema private (0014)'::text;
  end if;

  if array_length(missing, 1) is not null then
    raise exception '0023: missing %. Apply the files named (docs/MIGRATIONS.md), then re-run this file.',
      array_to_string(missing, ', ');
  end if;

  -- With a JWT on the session (the SQL editor's role impersonation) the
  -- functions below would be created by — and owned by — the impersonated role.
  if nullif(current_setting('request.jwt.claims', true), '') is not null then
    raise exception '0023: request.jwt.claims is set on this session — run this file as postgres with role impersonation off.';
  end if;
end
$preflight$;

-- =============================================================================
-- Section 1 — validators (IMMUTABLE, used by the CHECK constraints)
-- =============================================================================
-- Pure functions of their arguments. A CHECK evaluates them as the writing
-- role, so `authenticated` (the admin's session) and `service_role` (the seed,
-- S05) hold EXECUTE; they read nothing and grant nothing. The TS rules in
-- lib/attestation/schemas.ts are the primary gate and are never weaker than
-- these: the database only makes sure no path stores what the app could not
-- parse or would refuse to publish.

-- Each validator checks shape before it reads a value, one IF at a time: SQL
-- does not promise to evaluate AND / OR left to right, and a cast or
-- jsonb_object_keys() on the wrong JSON type raises instead of answering false.
--
-- The item validators call no other private.* function: a nested call resolves
-- the schema at run time, which needs USAGE on `private` — `authenticated` has
-- it (0014), `service_role` (the seed's writer) does not. The config
-- validators do call the two JSON helpers; only the admin's session and the
-- SQL editor ever write the config.

-- An integer-valued JSON number in [lo, hi].
create or replace function private.assessment_json_int_between(p jsonb, lo integer, hi integer)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v numeric;
begin
  if p is null or jsonb_typeof(p) <> 'number' then
    return false;
  end if;
  v := (p #>> '{}')::numeric;
  return v = trunc(v) and v >= lo and v <= hi;
end;
$$;

-- A JSON object with exactly these keys, no more, no fewer.
create or replace function private.assessment_json_keys_are(p jsonb, keys text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p is null or jsonb_typeof(p) <> 'object' then
    return false;
  end if;
  return (select coalesce(array_agg(k order by k), '{}'::text[]) from jsonb_object_keys(p) as k)
       = (select coalesce(array_agg(k order by k), '{}'::text[]) from unnest(keys) as k);
end;
$$;

-- {"1": {"partA": n, "partB": n}, … "4": …}: integers 0–100, each pair sums to 100.
create or replace function private.assessment_weights_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text;
begin
  if not private.assessment_json_keys_are(p, array['1', '2', '3', '4']) then
    return false;
  end if;
  foreach d in array array['1', '2', '3', '4'] loop
    if not private.assessment_json_keys_are(p -> d, array['partA', 'partB']) then
      return false;
    end if;
    if not private.assessment_json_int_between(p -> d -> 'partA', 0, 100)
       or not private.assessment_json_int_between(p -> d -> 'partB', 0, 100) then
      return false;
    end if;
    if (p -> d ->> 'partA')::numeric + (p -> d ->> 'partB')::numeric <> 100 then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- {"green": g, "yellow": y}: integers, 0 < yellow < green <= 100.
create or replace function private.assessment_thresholds_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if not private.assessment_json_keys_are(p, array['green', 'yellow']) then
    return false;
  end if;
  if not private.assessment_json_int_between(p -> 'green', 2, 100)
     or not private.assessment_json_int_between(p -> 'yellow', 1, 99) then
    return false;
  end if;
  return (p ->> 'yellow')::numeric < (p ->> 'green')::numeric;
end;
$$;

-- Per day: itemCount 1–30, itemSeconds 15–300, minTurns 2–30,
-- maxTurns minTurns–40, partBMinutes 5–60 — all integers.
create or replace function private.assessment_day_settings_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  d text;
  s jsonb;
begin
  if not private.assessment_json_keys_are(p, array['1', '2', '3', '4']) then
    return false;
  end if;
  foreach d in array array['1', '2', '3', '4'] loop
    s := p -> d;
    if not private.assessment_json_keys_are(s, array['itemCount', 'itemSeconds', 'minTurns', 'maxTurns', 'partBMinutes']) then
      return false;
    end if;
    if not private.assessment_json_int_between(s -> 'itemCount', 1, 30)
       or not private.assessment_json_int_between(s -> 'itemSeconds', 15, 300)
       or not private.assessment_json_int_between(s -> 'minTurns', 2, 30)
       or not private.assessment_json_int_between(s -> 'maxTurns', 2, 40)
       or not private.assessment_json_int_between(s -> 'partBMinutes', 5, 60) then
      return false;
    end if;
    if (s ->> 'maxTurns')::numeric < (s ->> 'minTurns')::numeric then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

-- An item's options, at every save: an array of at most 6
-- {"id", "text", "text_ru"} objects, ids `^[a-z0-9]{1,8}$` and unique, text a
-- string of at most 400 characters, text_ru a string of at most 400 or null.
create or replace function private.assessment_options_valid(p jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  o jsonb;
  ids text[] := '{}';
begin
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) > 6 then
    return false;
  end if;
  for o in select e from jsonb_array_elements(p) as e loop
    if jsonb_typeof(o) <> 'object' then
      return false;
    end if;
    if exists (select 1 from jsonb_object_keys(o) as k where k not in ('id', 'text', 'text_ru')) then
      return false;
    end if;
    if coalesce(jsonb_typeof(o -> 'id'), 'null') <> 'string'
       or coalesce(jsonb_typeof(o -> 'text'), 'null') <> 'string'
       or coalesce(jsonb_typeof(o -> 'text_ru'), 'null') not in ('string', 'null') then
      return false;
    end if;
    if (o ->> 'id') !~ '^[a-z0-9]{1,8}$'
       or char_length(o ->> 'text') > 400
       or char_length(coalesce(o ->> 'text_ru', '')) > 400
       or (o ->> 'id') = any (ids) then
      return false;
    end if;
    ids := ids || (o ->> 'id');
  end loop;
  return true;
end;
$$;

-- The answer key, at every save: unique option ids, each one an option's.
create or replace function private.assessment_answer_key_valid(p_options jsonb, p_key text[])
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_key is null or array_position(p_key, null) is not null then
    return false;
  end if;
  if cardinality(p_key) <> (select count(distinct k) from unnest(p_key) as k) then
    return false;
  end if;
  if cardinality(p_key) = 0 then
    return true;
  end if;
  if p_options is null or jsonb_typeof(p_options) <> 'array' then
    return false;
  end if;
  return p_key <@ coalesce(
    (select array_agg(e ->> 'id') from jsonb_array_elements(p_options) as e where jsonb_typeof(e) = 'object'),
    '{}'::text[]
  );
end;
$$;

-- The publish rules (docs/ATTESTATION.md §10), for a row whose status is
-- 'published'. The key ⊆ options and unique-ids rules hold at every save
-- already (the two validators above).
create or replace function private.assessment_item_publishable(
  p_kind text,
  p_prompt text,
  p_prompt_ru text,
  p_options jsonb,
  p_key text[],
  p_explanation text,
  p_explanation_ru text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  n integer;
begin
  if p_kind not in ('single', 'multi') then
    return false;
  end if;

  if btrim(coalesce(p_prompt, '')) = '' or char_length(p_prompt) > 400
     or btrim(coalesce(p_prompt_ru, '')) = '' or char_length(p_prompt_ru) > 400 then
    return false;
  end if;

  if jsonb_typeof(p_options) is distinct from 'array' then
    return false;
  end if;
  n := jsonb_array_length(p_options);
  if n < 2 or n > 6 then
    return false;
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_options) as e
    where btrim(coalesce(e ->> 'text', '')) = '' or char_length(e ->> 'text') > 160
       or btrim(coalesce(e ->> 'text_ru', '')) = '' or char_length(e ->> 'text_ru') > 160
  ) then
    return false;
  end if;

  -- No two options alike: whitespace collapsed and trimmed. The TS rule also
  -- ignores case; exact-after-whitespace here keeps the database the weaker of
  -- the two, never refusing what the editor accepted. Written inline, not as a
  -- private.* helper: a nested call resolves the schema at run time, which
  -- needs USAGE on it — authenticated has that, service_role does not — so the
  -- rule would depend on who writes the row.
  if (select count(distinct btrim(regexp_replace(coalesce(e ->> 'text', ''), '\s+', ' ', 'g')))
      from jsonb_array_elements(p_options) as e) <> n
     or (select count(distinct btrim(regexp_replace(coalesce(e ->> 'text_ru', ''), '\s+', ' ', 'g')))
         from jsonb_array_elements(p_options) as e) <> n then
    return false;
  end if;

  if cardinality(p_key) < 1 or (p_kind = 'single' and cardinality(p_key) <> 1) then
    return false;
  end if;

  -- Both languages or neither.
  return (btrim(coalesce(p_explanation, '')) = '') = (btrim(coalesce(p_explanation_ru, '')) = '');
end;
$$;

-- =============================================================================
-- Section 2 — tables
-- =============================================================================

create table if not exists public.assessment_config (
  id smallint primary key default 1
    constraint assessment_config_singleton_chk check (id = 1),
  weights jsonb not null
    constraint assessment_config_weights_chk check (private.assessment_weights_valid(weights)),
  thresholds jsonb not null
    constraint assessment_config_thresholds_chk check (private.assessment_thresholds_valid(thresholds)),
  day_settings jsonb not null
    constraint assessment_config_day_settings_chk check (private.assessment_day_settings_valid(day_settings)),
  extra_facts text not null default ''
    constraint assessment_config_extra_facts_chk check (char_length(extra_facts) <= 8000),
  extra_facts_ru text not null default ''
    constraint assessment_config_extra_facts_ru_chk check (char_length(extra_facts_ru) <= 8000),
  retention_days integer not null default 365
    constraint assessment_config_retention_chk check (retention_days between 30 and 3650),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table public.assessment_config is
  'Attestation settings, one row (id = 1): Part A/B weights per day, band thresholds, per-day item counts and limits, the admin''s extra facts (uz/ru) for the AI, retention. Admin reads and updates (version-guarded, audited); service_role reads. docs/ATTESTATION.md.';

create table if not exists public.assessment_items (
  id text primary key
    constraint assessment_items_id_chk check (id ~ '^[a-z0-9-]{1,80}$'),
  day smallint not null
    constraint assessment_items_day_chk check (day between 1 and 4),
  topic text not null
    constraint assessment_items_topic_chk check (topic ~ '^[a-z0-9-]{1,40}$'),
  kind text not null default 'single'
    constraint assessment_items_kind_chk check (kind in ('single', 'multi')),
  difficulty smallint not null default 1
    constraint assessment_items_difficulty_chk check (difficulty between 1 and 3),
  prompt text not null
    constraint assessment_items_prompt_chk check (char_length(prompt) between 1 and 1000),
  prompt_ru text
    constraint assessment_items_prompt_ru_chk check (prompt_ru is null or char_length(prompt_ru) <= 1000),
  options jsonb not null default '[]'::jsonb
    constraint assessment_items_options_chk check (private.assessment_options_valid(options)),
  answer_key text[] not null default '{}'::text[],
  explanation text
    constraint assessment_items_explanation_chk check (explanation is null or char_length(explanation) <= 2000),
  explanation_ru text
    constraint assessment_items_explanation_ru_chk check (explanation_ru is null or char_length(explanation_ru) <= 2000),
  source_ref text
    constraint assessment_items_source_ref_chk check (
      source_ref is null
      or source_ref ~ '^(script|objection|faq|competitor|package|product|sop|onboarding):[a-z0-9-]{1,80}$'
    ),
  status text not null default 'draft'
    constraint assessment_items_status_chk check (status in ('draft', 'published')),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint assessment_items_answer_key_chk check (private.assessment_answer_key_valid(options, answer_key)),
  constraint assessment_items_publishable_chk check (
    status <> 'published'
    or private.assessment_item_publishable(kind, prompt, prompt_ru, options, answer_key, explanation, explanation_ru)
  )
);

comment on table public.assessment_items is
  'The Part A item bank. Answer keys never leave the server on a candidate path. Admin only (RLS); published rows must pass private.assessment_item_publishable(). Every write audited in assessment_audit. docs/ATTESTATION.md §10.';

-- The draw reads one day's published items; the bank page groups by day.
create index if not exists assessment_items_day_status_idx
  on public.assessment_items (day, status);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_email text not null
    constraint assessment_attempts_email_chk check (user_email = lower(btrim(user_email)) and user_email <> ''),
  day smallint not null
    constraint assessment_attempts_day_chk check (day between 1 and 4),
  attempt_no smallint not null default 1
    constraint assessment_attempts_attempt_no_chk check (attempt_no between 1 and 100),
  status text not null default 'in_progress'
    constraint assessment_attempts_status_chk check (
      status in ('in_progress', 'submitted', 'evaluating', 'evaluated', 'eval_failed', 'archived')
    ),
  phase text not null default 'part_a'
    constraint assessment_attempts_phase_chk check (phase in ('part_a', 'part_b')),
  started_at timestamptz not null default now(),
  part_a_started_at timestamptz,
  part_a_finished_at timestamptz,
  part_b_started_at timestamptz,
  submitted_at timestamptz,
  item_ids text[] not null default '{}'::text[],
  served_items jsonb not null default '[]'::jsonb
    constraint assessment_attempts_served_items_chk check (jsonb_typeof(served_items) = 'array'),
  answers jsonb not null default '{}'::jsonb
    constraint assessment_attempts_answers_chk check (jsonb_typeof(answers) = 'object'),
  persona jsonb,
  part_a_score numeric(5, 2)
    constraint assessment_attempts_part_a_score_chk check (part_a_score between 0 and 100),
  part_b_score numeric(5, 2)
    constraint assessment_attempts_part_b_score_chk check (part_b_score between 0 and 100),
  day_score numeric(5, 2)
    constraint assessment_attempts_day_score_chk check (day_score between 0 and 100),
  rubric jsonb,
  factual_errors jsonb,
  evaluator_runs jsonb not null default '[]'::jsonb
    constraint assessment_attempts_evaluator_runs_chk check (jsonb_typeof(evaluator_runs) = 'array'),
  needs_review boolean not null default false,
  flags jsonb not null default '{}'::jsonb
    constraint assessment_attempts_flags_chk check (jsonb_typeof(flags) = 'object'),
  override_score numeric(5, 2)
    constraint assessment_attempts_override_score_chk check (override_score between 0 and 100),
  override_note text
    constraint assessment_attempts_override_note_chk check (
      override_note is null or (btrim(override_note) <> '' and char_length(override_note) <= 1000)
    ),
  overridden_by text,
  overridden_at timestamptz,
  model text,
  eval_model text,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by text,
  -- All four override columns together, or none.
  constraint assessment_attempts_override_chk check (
    num_nulls(override_score, override_note, overridden_by, overridden_at) in (0, 4)
  ),
  -- Everything after in_progress except archived happened at a submit.
  constraint assessment_attempts_submitted_chk check (
    status in ('in_progress', 'archived') or submitted_at is not null
  ),
  constraint assessment_attempts_evaluated_chk check (status <> 'evaluated' or day_score is not null),
  constraint assessment_attempts_attempt_no_key unique (user_email, day, attempt_no)
);

comment on table public.assessment_attempts is
  'One attestation attempt per (person, day, attempt_no); at most one non-archived per (person, day). Admin reads (RLS); candidates only through app/api/attestation (service role, scoped to the session email); admin writes only through the admin_assessment_* functions. docs/ATTESTATION.md.';

-- "At most one non-archived attempt per (person, day)": a reset archives, and
-- only then can the next attempt of that day be created.
create unique index if not exists assessment_attempts_one_open_idx
  on public.assessment_attempts (user_email, day)
  where status <> 'archived';

-- Retention's range delete.
create index if not exists assessment_attempts_started_idx
  on public.assessment_attempts (started_at);

create table if not exists public.assessment_messages (
  attempt_id uuid not null references public.assessment_attempts (id) on delete cascade,
  seq integer not null
    constraint assessment_messages_seq_chk check (seq between 1 and 200),
  role text not null
    constraint assessment_messages_role_chk check (role in ('customer', 'operator')),
  content text not null
    constraint assessment_messages_content_chk check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  latency_ms integer
    constraint assessment_messages_latency_chk check (latency_ms is null or latency_ms between 0 and 600000),
  constraint assessment_messages_pkey primary key (attempt_id, seq),
  -- OPERATOR_MESSAGE_MAX_CHARS in lib/attestation/schemas.ts.
  constraint assessment_messages_operator_len_chk check (role <> 'operator' or char_length(content) <= 600)
);

comment on table public.assessment_messages is
  'The Part B transcript, append-only (UPDATE refused by trigger); rows go only with their attempt. Admin reads (RLS); written by service_role only.';

create table if not exists public.assessment_unlocks (
  user_email text not null
    constraint assessment_unlocks_email_chk check (user_email = lower(btrim(user_email)) and user_email <> ''),
  day smallint not null
    constraint assessment_unlocks_day_chk check (day between 2 and 4),
  unlocked_by text not null,
  unlocked_at timestamptz not null default now(),
  constraint assessment_unlocks_pkey primary key (user_email, day)
);

comment on table public.assessment_unlocks is
  'Days the admin opened without the waiting day (the order is still enforced). Written only by admin_assessment_unlock / _reset_person.';

create table if not exists public.assessment_audit (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  actor text not null,
  action text not null
    constraint assessment_audit_action_chk check (action in (
      'override', 'override_clear', 'reset', 'reset_person', 'unlock', 'config_update',
      'item_create', 'item_update', 'item_publish', 'item_unpublish', 'item_delete'
    )),
  target_email text,
  -- No foreign key: the attempt may be purged or aged out, the record stays.
  attempt_id uuid,
  item_id text,
  day smallint,
  details jsonb not null default '{}'::jsonb
    constraint assessment_audit_details_chk check (jsonb_typeof(details) = 'object')
);

comment on table public.assessment_audit is
  'Append-only record of every admin action on the attestation (override, reset, unlock, config and item changes). Written only by SECURITY DEFINER functions and triggers; never purged, no retention (like access_audit).';

create index if not exists assessment_audit_created_idx
  on public.assessment_audit (created_at desc);

create index if not exists assessment_audit_target_idx
  on public.assessment_audit (target_email, created_at desc)
  where target_email is not null;

-- =============================================================================
-- Section 3 — row level security and policies
-- =============================================================================
-- Every table: RLS on; one RESTRICTIVE admin-only policy for `authenticated`
-- (ANDed with every permissive one — the safety net of the header); and the
-- permissive admin policies for exactly the commands the admin may run.

alter table public.assessment_config enable row level security;
alter table public.assessment_items enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.assessment_messages enable row level security;
alter table public.assessment_unlocks enable row level security;
alter table public.assessment_audit enable row level security;

do $policies$
declare
  t text;
begin
  foreach t in array array[
    'assessment_config', 'assessment_items', 'assessment_attempts',
    'assessment_messages', 'assessment_unlocks', 'assessment_audit'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_admin_only', t);
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using ((select private.is_admin())) with check ((select private.is_admin()))',
      t || '_admin_only', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_admin_select', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_admin()))',
      t || '_admin_select', t
    );
  end loop;
end
$policies$;

drop policy if exists "assessment_config_admin_update" on public.assessment_config;
create policy "assessment_config_admin_update" on public.assessment_config
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "assessment_items_admin_insert" on public.assessment_items;
create policy "assessment_items_admin_insert" on public.assessment_items
  for insert to authenticated
  with check ((select private.is_admin()));

drop policy if exists "assessment_items_admin_update" on public.assessment_items;
create policy "assessment_items_admin_update" on public.assessment_items
  for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

drop policy if exists "assessment_items_admin_delete" on public.assessment_items;
create policy "assessment_items_admin_delete" on public.assessment_items
  for delete to authenticated
  using ((select private.is_admin()));

-- =============================================================================
-- Section 4 — grants
-- =============================================================================
-- Supabase's default privileges gave anon, authenticated and service_role ALL
-- on the new tables; a table-level REVOKE also clears column grants, so this
-- converges whatever was there before the lists below are granted. The
-- identity sequence of the audit is nobody's: its only writers run as owner.

revoke all on table
  public.assessment_config, public.assessment_items, public.assessment_attempts,
  public.assessment_messages, public.assessment_unlocks, public.assessment_audit
  from public, anon, authenticated, service_role;
revoke all on sequence public.assessment_audit_id_seq from public, anon, authenticated, service_role;

-- The admin's session (RLS decides the rows: the admin's only).
grant select on table
  public.assessment_config, public.assessment_items, public.assessment_attempts,
  public.assessment_messages, public.assessment_unlocks, public.assessment_audit
  to authenticated;
grant update (weights, thresholds, day_settings, extra_facts, extra_facts_ru, retention_days)
  on table public.assessment_config to authenticated;
grant insert (id, day, topic, kind, difficulty, prompt, prompt_ru, options, answer_key,
              explanation, explanation_ru, source_ref, status)
  on table public.assessment_items to authenticated;
grant update (day, topic, kind, difficulty, prompt, prompt_ru, options, answer_key,
              explanation, explanation_ru, source_ref, status)
  on table public.assessment_items to authenticated;
grant delete on table public.assessment_items to authenticated;

-- The service role (S05's candidate paths and evaluator; the staging seed).
grant select on table
  public.assessment_config, public.assessment_items, public.assessment_attempts,
  public.assessment_messages, public.assessment_unlocks
  to service_role;
-- The seed upserts drafts (`--force` rewrites every column it sends), so the
-- service role's item grants are table-level; `version`, `updated_at` and
-- `updated_by` are still the triggers' to set.
grant insert, update on table public.assessment_items to service_role;
-- Starting an attempt: who, which day and try, the drawn items, the persona.
grant insert (user_email, day, attempt_no, phase, part_a_started_at, item_ids, served_items,
              answers, persona, model)
  on table public.assessment_attempts to service_role;
-- Progress and evaluation. Never user_email, day, attempt_no, the drawn items,
-- the override columns or version: an attempt cannot change hands, its items
-- cannot change after the draw, and only the admin overrides.
grant update (status, phase, part_a_started_at, part_a_finished_at, part_b_started_at, submitted_at,
              answers, persona, part_a_score, part_b_score, day_score, rubric, factual_errors,
              evaluator_runs, needs_review, flags, model, eval_model)
  on table public.assessment_attempts to service_role;
grant insert (attempt_id, seq, role, content, latency_ms)
  on table public.assessment_messages to service_role;

-- The validators run as the writing role (Section 1).
revoke all on function
  private.assessment_json_int_between(jsonb, integer, integer),
  private.assessment_json_keys_are(jsonb, text[]),
  private.assessment_weights_valid(jsonb),
  private.assessment_thresholds_valid(jsonb),
  private.assessment_day_settings_valid(jsonb),
  private.assessment_options_valid(jsonb),
  private.assessment_answer_key_valid(jsonb, text[]),
  private.assessment_item_publishable(text, text, text, jsonb, text[], text, text)
  from public, anon;
grant execute on function
  private.assessment_json_int_between(jsonb, integer, integer),
  private.assessment_json_keys_are(jsonb, text[]),
  private.assessment_weights_valid(jsonb),
  private.assessment_thresholds_valid(jsonb),
  private.assessment_day_settings_valid(jsonb),
  private.assessment_options_valid(jsonb),
  private.assessment_answer_key_valid(jsonb, text[]),
  private.assessment_item_publishable(text, text, text, jsonb, text[], text, text)
  to authenticated, service_role;

-- =============================================================================
-- Section 5 — bookkeeping and append-only triggers
-- =============================================================================

create or replace function private.assessment_bump_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  return new;
end;
$$;

comment on function private.assessment_bump_version() is
  'BEFORE UPDATE on assessment_config / _items / _attempts: version = old.version + 1 on every update, whatever the writer sent — the optimistic-concurrency counter.';

create or replace function private.assessment_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only (% refused)', tg_table_name, lower(tg_op)
    using errcode = 'insufficient_privilege';
end;
$$;

comment on function private.assessment_append_only() is
  'BEFORE UPDATE (and on assessment_audit DELETE / TRUNCATE): always raises. assessment_messages rows go only with their attempt; the audit keeps everything.';

-- BEFORE triggers fire in name order; none of them reads a column another one
-- writes. public.stamp_content_actor (0013) sets updated_by from the JWT email
-- and keeps a service-role caller's own value.

drop trigger if exists trg_assessment_config_actor on public.assessment_config;
create trigger trg_assessment_config_actor
  before insert or update on public.assessment_config
  for each row execute function public.stamp_content_actor();
drop trigger if exists trg_assessment_config_updated_at on public.assessment_config;
create trigger trg_assessment_config_updated_at
  before update on public.assessment_config
  for each row execute function public.set_updated_at();
drop trigger if exists trg_assessment_config_version on public.assessment_config;
create trigger trg_assessment_config_version
  before update on public.assessment_config
  for each row execute function private.assessment_bump_version();

drop trigger if exists trg_assessment_items_actor on public.assessment_items;
create trigger trg_assessment_items_actor
  before insert or update on public.assessment_items
  for each row execute function public.stamp_content_actor();
drop trigger if exists trg_assessment_items_updated_at on public.assessment_items;
create trigger trg_assessment_items_updated_at
  before update on public.assessment_items
  for each row execute function public.set_updated_at();
drop trigger if exists trg_assessment_items_version on public.assessment_items;
create trigger trg_assessment_items_version
  before update on public.assessment_items
  for each row execute function private.assessment_bump_version();

drop trigger if exists trg_assessment_attempts_actor on public.assessment_attempts;
create trigger trg_assessment_attempts_actor
  before insert or update on public.assessment_attempts
  for each row execute function public.stamp_content_actor();
drop trigger if exists trg_assessment_attempts_updated_at on public.assessment_attempts;
create trigger trg_assessment_attempts_updated_at
  before update on public.assessment_attempts
  for each row execute function public.set_updated_at();
drop trigger if exists trg_assessment_attempts_version on public.assessment_attempts;
create trigger trg_assessment_attempts_version
  before update on public.assessment_attempts
  for each row execute function private.assessment_bump_version();

drop trigger if exists trg_assessment_messages_append_only on public.assessment_messages;
create trigger trg_assessment_messages_append_only
  before update on public.assessment_messages
  for each row execute function private.assessment_append_only();

drop trigger if exists trg_assessment_audit_append_only on public.assessment_audit;
create trigger trg_assessment_audit_append_only
  before update or delete on public.assessment_audit
  for each row execute function private.assessment_append_only();
drop trigger if exists trg_assessment_audit_no_truncate on public.assessment_audit;
create trigger trg_assessment_audit_no_truncate
  before truncate on public.assessment_audit
  for each statement execute function private.assessment_append_only();

-- =============================================================================
-- Section 6 — audit triggers for items and config (SECURITY DEFINER)
-- =============================================================================
-- AFTER, so only a change that happened is recorded. SECURITY DEFINER: no API
-- role may insert into assessment_audit. actor = the JWT email, else the JWT
-- role (service_role through the API), else the database login — 0017's rule.
-- The details name what changed, never the answer key or the text itself.

create or replace function private.audit_assessment_items()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims constant jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  actor constant text := coalesce(nullif(claims ->> 'email', ''), nullif(claims ->> 'role', ''), session_user::text);
  changed text[];
  v_action text;
begin
  if tg_op = 'INSERT' then
    insert into public.assessment_audit (actor, action, item_id, day, details)
    values (actor, 'item_create', new.id, new.day,
            jsonb_build_object('status', new.status, 'version', new.version, 'topic', new.topic));
    return null;
  end if;

  if tg_op = 'DELETE' then
    insert into public.assessment_audit (actor, action, item_id, day, details)
    values (actor, 'item_delete', old.id, old.day,
            jsonb_build_object('status', old.status, 'version', old.version, 'topic', old.topic));
    return null;
  end if;

  select coalesce(array_agg(k order by k), '{}'::text[]) into changed
  from jsonb_object_keys(to_jsonb(new)) as k
  where k not in ('version', 'created_at', 'updated_at', 'updated_by')
    and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k);

  if cardinality(changed) = 0 then
    return null;
  end if;

  v_action := case
    when old.status = 'draft' and new.status = 'published' then 'item_publish'
    when old.status = 'published' and new.status = 'draft' then 'item_unpublish'
    else 'item_update'
  end;

  insert into public.assessment_audit (actor, action, item_id, day, details)
  values (actor, v_action, new.id, new.day,
          jsonb_build_object('status', new.status, 'version', new.version, 'changed', to_jsonb(changed)));
  return null;
end;
$$;

comment on function private.audit_assessment_items() is
  'AFTER INSERT/UPDATE/DELETE on assessment_items: one assessment_audit row (item_create / item_update / item_publish / item_unpublish / item_delete) naming the changed columns, never their values. No row for an update that changes nothing.';

create or replace function private.audit_assessment_config()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  claims constant jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  actor constant text := coalesce(nullif(claims ->> 'email', ''), nullif(claims ->> 'role', ''), session_user::text);
  details jsonb := '{}'::jsonb;
  changed text[] := '{}';
begin
  if new.weights is distinct from old.weights then
    changed := changed || 'weights'::text;
    details := details || jsonb_build_object('weights', jsonb_build_object('from', old.weights, 'to', new.weights));
  end if;
  if new.thresholds is distinct from old.thresholds then
    changed := changed || 'thresholds'::text;
    details := details || jsonb_build_object('thresholds', jsonb_build_object('from', old.thresholds, 'to', new.thresholds));
  end if;
  if new.day_settings is distinct from old.day_settings then
    changed := changed || 'day_settings'::text;
    details := details || jsonb_build_object('day_settings', jsonb_build_object('from', old.day_settings, 'to', new.day_settings));
  end if;
  if new.retention_days is distinct from old.retention_days then
    changed := changed || 'retention_days'::text;
    details := details || jsonb_build_object('retention_days', jsonb_build_object('from', old.retention_days, 'to', new.retention_days));
  end if;
  -- The facts themselves can be 8000 characters: only that they changed.
  if new.extra_facts is distinct from old.extra_facts then
    changed := changed || 'extra_facts'::text;
    details := details || jsonb_build_object('extra_facts', jsonb_build_object('chars', char_length(new.extra_facts)));
  end if;
  if new.extra_facts_ru is distinct from old.extra_facts_ru then
    changed := changed || 'extra_facts_ru'::text;
    details := details || jsonb_build_object('extra_facts_ru', jsonb_build_object('chars', char_length(new.extra_facts_ru)));
  end if;

  if cardinality(changed) = 0 then
    return null;
  end if;

  insert into public.assessment_audit (actor, action, details)
  values (actor, 'config_update', details || jsonb_build_object('changed', to_jsonb(changed), 'version', new.version));
  return null;
end;
$$;

comment on function private.audit_assessment_config() is
  'AFTER UPDATE on assessment_config: one config_update row with before/after of the numbers and the length of changed extra facts. No row for an update that changes nothing.';

drop trigger if exists trg_assessment_items_audit on public.assessment_items;
create trigger trg_assessment_items_audit
  after insert or update or delete on public.assessment_items
  for each row execute function private.audit_assessment_items();

drop trigger if exists trg_assessment_config_audit on public.assessment_config;
create trigger trg_assessment_config_audit
  after update on public.assessment_config
  for each row execute function private.audit_assessment_config();

-- Trigger functions are never called by name: no role needs EXECUTE.
revoke all on function
  private.assessment_bump_version(),
  private.assessment_append_only(),
  private.audit_assessment_items(),
  private.audit_assessment_config()
  from public, anon, authenticated, service_role;

-- =============================================================================
-- Section 7 — the admin functions (SECURITY DEFINER)
-- =============================================================================

-- The common opening of the five, in 0022's order: the claim (before any lock,
-- so a non-admin never waits on or holds up an allow-list write), then the
-- allow-list guard's advisory lock (0017), then the caller's own row. Returns
-- the caller's email. INVOKER, but only ever called from the DEFINER functions
-- below, so it runs as their owner; nobody else may execute it.
create or replace function private.assessment_admin_actor(p_fn text)
returns text
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  claims constant jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  actor constant text := lower(btrim(coalesce(claims ->> 'email', '')));
begin
  if not (select private.is_admin()) then
    raise exception '%: admin role required', p_fn using errcode = 'WT403';
  end if;

  perform pg_catalog.pg_advisory_xact_lock('public.allowed_users'::regclass::oid::bigint);

  if actor = '' or not exists (
    select 1 from public.allowed_users a
    where lower(a.email) = actor and a.role = 'admin' and a.is_active
  ) then
    raise exception '%: the caller is not an active admin', p_fn using errcode = 'WT403';
  end if;

  return actor;
end;
$$;

comment on function private.assessment_admin_actor(text) is
  'Opening of every admin_assessment_* function: WT403 unless the claim is admin and, under the allow-list advisory lock, the caller''s row is an active admin. Returns the caller''s email.';

revoke all on function private.assessment_admin_actor(text) from public, anon, authenticated, service_role;

-- --- Override, and clearing one -------------------------------------------------

create or replace function public.admin_assessment_override(
  p_attempt uuid,
  p_score numeric,
  p_note text,
  p_version integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor text;
  v_note constant text := btrim(coalesce(p_note, ''));
  v_score constant numeric := round(p_score, 2);
  att record;
  new_version integer;
begin
  actor := private.assessment_admin_actor('admin_assessment_override');

  if p_attempt is null or p_version is null or p_version < 1 then
    raise exception 'admin_assessment_override: p_attempt and a positive p_version are required' using errcode = 'WT400';
  end if;
  if p_score is null or p_score < 0 or p_score > 100 then
    raise exception 'admin_assessment_override: p_score must be 0-100' using errcode = 'WT400';
  end if;
  if v_note = '' or char_length(v_note) > 1000 then
    raise exception 'admin_assessment_override: a note of 1-1000 characters is required' using errcode = 'WT400';
  end if;

  select a.id, a.user_email, a.day, a.status, a.version, a.day_score, a.override_score
    into att
  from public.assessment_attempts a
  where a.id = p_attempt
  for update;

  if not found then
    raise exception 'admin_assessment_override: no such attempt' using errcode = 'WT404';
  end if;
  -- Only a submitted attempt has a score to replace; one being taken or
  -- archived changed since the admin looked — as does a stale version.
  if att.version <> p_version or att.status not in ('submitted', 'evaluating', 'evaluated', 'eval_failed') then
    raise exception 'admin_assessment_override: the attempt changed since it was read' using errcode = 'WT409';
  end if;

  update public.assessment_attempts a
  set override_score = v_score,
      override_note = v_note,
      overridden_by = actor,
      overridden_at = now()
  where a.id = p_attempt
  returning a.version into new_version;

  insert into public.assessment_audit (actor, action, target_email, attempt_id, day, details)
  values (actor, 'override', att.user_email, att.id, att.day,
          jsonb_build_object('computed', att.day_score, 'previous_override', att.override_score,
                             'score', v_score, 'note', v_note, 'version', new_version));

  return new_version;
end;
$$;

comment on function public.admin_assessment_override(uuid, numeric, text, integer) is
  'Admin only: replaces a submitted attempt''s day score with p_score (0-100, two decimals), with a required note (1-1000), guarded on p_version. Audited (override, with the computed and previous scores). Returns the new version. WT403 / WT400 / WT404 / WT409.';

-- A separate function rather than a null score: every argument of an RPC is
-- then a plain value (the generated types have no nullable arguments), and
-- "clear" says what it does.
create or replace function public.admin_assessment_clear_override(
  p_attempt uuid,
  p_note text,
  p_version integer
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor text;
  v_note constant text := btrim(coalesce(p_note, ''));
  att record;
  new_version integer;
begin
  actor := private.assessment_admin_actor('admin_assessment_clear_override');

  if p_attempt is null or p_version is null or p_version < 1 then
    raise exception 'admin_assessment_clear_override: p_attempt and a positive p_version are required' using errcode = 'WT400';
  end if;
  if v_note = '' or char_length(v_note) > 1000 then
    raise exception 'admin_assessment_clear_override: a note of 1-1000 characters is required' using errcode = 'WT400';
  end if;

  select a.id, a.user_email, a.day, a.version, a.day_score, a.override_score
    into att
  from public.assessment_attempts a
  where a.id = p_attempt
  for update;

  if not found then
    raise exception 'admin_assessment_clear_override: no such attempt' using errcode = 'WT404';
  end if;
  -- No override left to clear is a change the admin has not seen either.
  if att.version <> p_version or att.override_score is null then
    raise exception 'admin_assessment_clear_override: the attempt changed since it was read' using errcode = 'WT409';
  end if;

  update public.assessment_attempts a
  set override_score = null, override_note = null, overridden_by = null, overridden_at = null
  where a.id = p_attempt
  returning a.version into new_version;

  insert into public.assessment_audit (actor, action, target_email, attempt_id, day, details)
  values (actor, 'override_clear', att.user_email, att.id, att.day,
          jsonb_build_object('computed', att.day_score, 'previous_override', att.override_score,
                             'note', v_note, 'version', new_version));

  return new_version;
end;
$$;

comment on function public.admin_assessment_clear_override(uuid, text, integer) is
  'Admin only: removes an attempt''s override (the computed day score counts again), with a required note, guarded on p_version. Audited (override_clear). Returns the new version. WT403 / WT400 / WT404 / WT409.';

-- --- Reset one attempt ----------------------------------------------------------

create or replace function public.admin_assessment_reset(p_attempt uuid, p_version integer default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor text;
  att record;
begin
  actor := private.assessment_admin_actor('admin_assessment_reset');

  if p_attempt is null or (p_version is not null and p_version < 1) then
    raise exception 'admin_assessment_reset: p_attempt is required, p_version positive when given' using errcode = 'WT400';
  end if;

  select a.id, a.user_email, a.day, a.status, a.phase, a.attempt_no, a.version
    into att
  from public.assessment_attempts a
  where a.id = p_attempt
  for update;

  if not found then
    raise exception 'admin_assessment_reset: no such attempt' using errcode = 'WT404';
  end if;
  if att.status = 'archived' or (p_version is not null and att.version <> p_version) then
    raise exception 'admin_assessment_reset: the attempt changed since it was read' using errcode = 'WT409';
  end if;

  update public.assessment_attempts a set status = 'archived' where a.id = p_attempt;

  insert into public.assessment_audit (actor, action, target_email, attempt_id, day, details)
  values (actor, 'reset', att.user_email, att.id, att.day,
          jsonb_build_object('previous_status', att.status, 'phase', att.phase, 'attempt_no', att.attempt_no));
end;
$$;

comment on function public.admin_assessment_reset(uuid, integer) is
  'Admin only: archives one attempt (its data kept) so the day can be taken again. Optional version guard. Audited (reset). WT403 / WT400 / WT404 / WT409.';

-- --- Reset a person ---------------------------------------------------------------

create or replace function public.admin_assessment_reset_person(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor text;
  v_email constant text := lower(btrim(coalesce(p_email, '')));
  archived bigint;
  unlocks_removed bigint;
begin
  actor := private.assessment_admin_actor('admin_assessment_reset_person');

  if v_email = '' then
    raise exception 'admin_assessment_reset_person: p_email must be a non-empty email' using errcode = 'WT400';
  end if;

  update public.assessment_attempts a set status = 'archived'
  where a.user_email = v_email and a.status <> 'archived';
  get diagnostics archived = row_count;

  delete from public.assessment_unlocks u where u.user_email = v_email;
  get diagnostics unlocks_removed = row_count;

  -- A reset that changed nothing is not an event.
  if archived + unlocks_removed > 0 then
    insert into public.assessment_audit (actor, action, target_email, details)
    values (actor, 'reset_person', v_email,
            jsonb_build_object('attempts_archived', archived, 'unlocks_removed', unlocks_removed));
  end if;

  return jsonb_build_object('attempts_archived', archived, 'unlocks_removed', unlocks_removed);
end;
$$;

comment on function public.admin_assessment_reset_person(text) is
  'Admin only: archives every open attempt of the email and removes its unlocks, so the person starts again at day 1 under the normal pace. Returns {"attempts_archived", "unlocks_removed"}; audited (reset_person) when anything changed. WT403 / WT400.';

-- --- Unlock a day -------------------------------------------------------------------

create or replace function public.admin_assessment_unlock(p_email text, p_day smallint)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  actor text;
  v_email constant text := lower(btrim(coalesce(p_email, '')));
  inserted bigint;
begin
  actor := private.assessment_admin_actor('admin_assessment_unlock');

  if v_email = '' or p_day is null or p_day not between 2 and 4 then
    raise exception 'admin_assessment_unlock: a non-empty email and a day of 2-4 are required' using errcode = 'WT400';
  end if;

  -- Only a candidate: an allow-listed operator or sales manager.
  if not exists (
    select 1 from public.allowed_users a
    where a.email = v_email and a.role in ('operator', 'manager')
  ) then
    raise exception 'admin_assessment_unlock: no operator or sales manager with that email' using errcode = 'WT404';
  end if;

  insert into public.assessment_unlocks (user_email, day, unlocked_by)
  values (v_email, p_day, actor)
  on conflict (user_email, day) do nothing;
  get diagnostics inserted = row_count;

  if inserted > 0 then
    insert into public.assessment_audit (actor, action, target_email, day, details)
    values (actor, 'unlock', v_email, p_day, '{}'::jsonb);
  end if;

  return inserted > 0;
end;
$$;

comment on function public.admin_assessment_unlock(text, smallint) is
  'Admin only: opens day 2-4 for a candidate without the waiting day (the previous day must still be submitted). True when a new unlock was recorded (audited), false when it already existed. WT403 / WT400 / WT404.';

-- `create function` grants EXECUTE to PUBLIC, and Supabase's default privileges
-- to anon, authenticated and service_role — revoke those, then grant the one
-- role an admin's session uses. An operator or a sales manager is also
-- `authenticated`: the first statement refuses them (WT403).
revoke all on function
  public.admin_assessment_override(uuid, numeric, text, integer),
  public.admin_assessment_clear_override(uuid, text, integer),
  public.admin_assessment_reset(uuid, integer),
  public.admin_assessment_reset_person(text),
  public.admin_assessment_unlock(text, smallint)
  from public, anon, service_role;
grant execute on function
  public.admin_assessment_override(uuid, numeric, text, integer),
  public.admin_assessment_clear_override(uuid, text, integer),
  public.admin_assessment_reset(uuid, integer),
  public.admin_assessment_reset_person(text),
  public.admin_assessment_unlock(text, smallint)
  to authenticated;

-- =============================================================================
-- Section 8 — public.admin_purge_person_history(p_email), 0022 + attestation
-- =============================================================================
-- 0022's body, unchanged, plus the person's attempts (their messages cascade)
-- and unlocks. The result gains three counts. assessment_audit is never
-- touched, like access_audit: it is the record of what the admin did.

create or replace function public.admin_purge_person_history(p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  claims constant jsonb := nullif(current_setting('request.jwt.claims', true), '')::jsonb;
  actor constant text := lower(btrim(coalesce(claims ->> 'email', '')));
  v_email constant text := lower(btrim(coalesce(p_email, '')));
  telemetry_deleted bigint;
  user_state_deleted bigint;
  copilot_deleted bigint;
  attempts_deleted bigint;
  messages_deleted bigint;
  unlocks_deleted bigint;
begin
  -- The claim first, before any lock: an operator's or a sales manager's call
  -- ends here and never waits on, or holds up, an allow-list write.
  if not (select private.is_admin()) then
    raise exception 'admin_purge_person_history: admin role required' using errcode = 'WT403';
  end if;

  -- The allow-list guard's lock (0017), so the checks below cannot interleave
  -- with an allow-list write — a promotion in the SQL editor, a demotion of the
  -- caller. Released at commit or rollback.
  perform pg_catalog.pg_advisory_xact_lock('public.allowed_users'::regclass::oid::bigint);

  -- Like the guard: the caller's row must still be an active admin. A demoted
  -- or deactivated admin keeps an admin token for up to an hour.
  if actor = '' or not exists (
    select 1 from public.allowed_users a
    where lower(a.email) = actor and a.role = 'admin' and a.is_active
  ) then
    raise exception 'admin_purge_person_history: the caller is not an active admin' using errcode = 'WT403';
  end if;

  if v_email = '' then
    raise exception 'admin_purge_person_history: p_email must be a non-empty email' using errcode = 'WT400';
  end if;

  -- Same order as the guard: self (WT461) before admin rows (WT462). Messages
  -- name no email — they reach the server log.
  if v_email = actor then
    raise exception 'admin_purge_person_history: an admin cannot purge their own history' using errcode = 'WT461';
  end if;

  if exists (
    select 1 from public.allowed_users a
    where lower(a.email) = v_email and a.role = 'admin'
  ) then
    raise exception 'admin_purge_person_history: an admin row is managed in the SQL editor only' using errcode = 'WT462';
  end if;

  delete from public.telemetry_events e where e.user_email = v_email;
  get diagnostics telemetry_deleted = row_count;

  delete from public.user_state s where s.user_email = v_email;
  get diagnostics user_state_deleted = row_count;

  delete from public.copilot_logs l where l.email = v_email;
  get diagnostics copilot_deleted = row_count;

  -- 0023: the attestation. Messages go with their attempt (on delete cascade),
  -- so they are counted first.
  select count(*) into messages_deleted
  from public.assessment_messages m
  join public.assessment_attempts a on a.id = m.attempt_id
  where a.user_email = v_email;

  delete from public.assessment_attempts a where a.user_email = v_email;
  get diagnostics attempts_deleted = row_count;

  delete from public.assessment_unlocks u where u.user_email = v_email;
  get diagnostics unlocks_deleted = row_count;

  return jsonb_build_object(
    'telemetry', telemetry_deleted,
    'user_state', user_state_deleted,
    'copilot', copilot_deleted,
    'assessment_attempts', attempts_deleted,
    'assessment_messages', messages_deleted,
    'assessment_unlocks', unlocks_deleted
  );
end;
$$;

comment on function public.admin_purge_person_history(text) is
  'Deletes one person''s telemetry_events, user_state, copilot_logs, assessment_attempts (messages cascade) and assessment_unlocks rows (email lower(btrim())-normalised, exact match) and returns {"telemetry", "user_state", "copilot", "assessment_attempts", "assessment_messages", "assessment_unlocks"} counts. Admin only: WT403 for a non-admin claim or a caller whose row is not an active admin; WT400 empty email; WT461 own email; WT462 an admin row''s email. Does not require the allow-list row to be gone; never touches access_audit or assessment_audit. SECURITY DEFINER (0022 header; attestation since 0023).';

-- `create or replace` keeps the privileges 0022 set; re-stated so a database
-- whose grants were edited by hand converges.
revoke all on function public.admin_purge_person_history(text) from public, anon, service_role;
grant execute on function public.admin_purge_person_history(text) to authenticated;

-- =============================================================================
-- Section 9 — public.run_assessment_retention()
-- =============================================================================
-- SECURITY DEFINER: it deletes rows no session role may delete. EXECUTE is
-- service_role's alone (/api/cron/content-scan, lib/agents/retention.ts);
-- pg_cron runs it as the owner. A separate function rather than a new version
-- of 0016's run_retention(): its result columns would change, which means
-- dropping it, and a later re-run of 0016 would silently take attestation
-- retention away again.
--
-- Attempts whose started_at is older than assessment_config.retention_days
-- (365 when the row is missing) go, with their messages (cascade); unlocks
-- older than that too. p_skip_if_scheduled works like run_retention's.

create or replace function public.run_assessment_retention(p_skip_if_scheduled boolean default false)
returns table (
  skipped boolean,
  window_days integer,
  attempts_deleted bigint,
  messages_deleted bigint,
  unlocks_deleted bigint
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  -- Must match the job name scheduled below.
  cron_job_name constant text := 'watertech-run-assessment-retention';
  started_at constant timestamptz := now();
  scheduled boolean := false;
  cutoff timestamptz;
begin
  if p_skip_if_scheduled and to_regclass('cron.job') is not null then
    -- Dynamic: cron.job exists only where pg_cron is enabled.
    execute 'select exists (select 1 from cron.job where jobname = $1 and active)'
      into scheduled
      using cron_job_name;
  end if;

  select c.retention_days into window_days from public.assessment_config c where c.id = 1;
  window_days := coalesce(window_days, 365);
  attempts_deleted := 0;
  messages_deleted := 0;
  unlocks_deleted := 0;

  if scheduled then
    skipped := true;
    return next;
    return;
  end if;
  skipped := false;

  cutoff := started_at - make_interval(days => window_days);

  select count(*) into messages_deleted
  from public.assessment_messages m
  join public.assessment_attempts a on a.id = m.attempt_id
  where a.started_at < cutoff;

  delete from public.assessment_attempts a where a.started_at < cutoff;
  get diagnostics attempts_deleted = row_count;

  delete from public.assessment_unlocks u where u.unlocked_at < cutoff;
  get diagnostics unlocks_deleted = row_count;

  return next;
end;
$$;

comment on function public.run_assessment_retention(boolean) is
  'Daily attestation retention: attempts (messages cascade) and unlocks older than assessment_config.retention_days (default 365). service_role / pg_cron only.';

revoke all on function public.run_assessment_retention(boolean) from public, anon, authenticated;
grant execute on function public.run_assessment_retention(boolean) to service_role;

-- 21:35 UTC = 02:35 in Tashkent, five minutes after run_retention's job (0016).
do $schedule$
begin
  if exists (select 1 from pg_catalog.pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'watertech-run-assessment-retention',
      '35 21 * * *',
      'select * from public.run_assessment_retention()'
    );
    raise notice '0023: pg_cron job watertech-run-assessment-retention scheduled daily at 21:35 UTC.';
  else
    raise notice '0023: pg_cron is not enabled — /api/cron/content-scan runs public.run_assessment_retention() after run_retention().';
  end if;
end
$schedule$;

-- =============================================================================
-- Section 10 — the definer functions run as someone RLS does not narrow
-- =============================================================================
-- A SECURITY DEFINER function skips RLS only if its owner is a superuser, has
-- BYPASSRLS, or owns the table (and the table does not FORCE row level
-- security). Otherwise every admin function answers WT403 (it cannot see the
-- caller's allow-list row), the purge and the retention report zeros while the
-- rows stay, and the audit triggers fail every item write. Checked once, here.

do $owner$
declare
  f text;
  fn_owner oid;
  fn_owner_name text;
  bypasses boolean;
  t record;
  problems text[] := '{}';
begin
  foreach f in array array[
    'public.admin_assessment_override(uuid, numeric, text, integer)',
    'public.admin_assessment_clear_override(uuid, text, integer)',
    'public.admin_assessment_reset(uuid, integer)',
    'public.admin_assessment_reset_person(text)',
    'public.admin_assessment_unlock(text, smallint)',
    'public.admin_purge_person_history(text)',
    'public.run_assessment_retention(boolean)',
    'private.audit_assessment_items()',
    'private.audit_assessment_config()'
  ] loop
    select p.proowner into fn_owner from pg_catalog.pg_proc p where p.oid = f::regprocedure;
    select r.rolname, (r.rolsuper or r.rolbypassrls) into fn_owner_name, bypasses
    from pg_catalog.pg_roles r where r.oid = fn_owner;

    for t in
      select c.relowner, c.relforcerowsecurity, format('%I.%I', n.nspname, c.relname) as name
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relname in (
          'allowed_users', 'assessment_config', 'assessment_items', 'assessment_attempts',
          'assessment_messages', 'assessment_unlocks', 'assessment_audit'
        )
    loop
      if not (bypasses or (t.relowner = fn_owner and not t.relforcerowsecurity)) then
        problems := problems || format('%s on %s (owned by %s)', f, t.name, pg_catalog.pg_get_userbyid(t.relowner));
      end if;
    end loop;
  end loop;

  if array_length(problems, 1) is not null then
    raise exception '0023: SECURITY DEFINER functions would run under RLS: % — run this file as the owner of those tables (postgres), then re-run it.',
      array_to_string(problems, '; ');
  end if;
end
$owner$;

-- =============================================================================
-- Section 11 — the default configuration
-- =============================================================================
-- Inserted once; a re-run keeps whatever the admin saved since. The JSON
-- between the $defaults$ markers is also read by
-- tests/unit/attestation/config.test.ts, which fails if it drifts from
-- DEFAULT_ASSESSMENT_CONFIG in lib/attestation/config.ts.

insert into public.assessment_config (id, weights, thresholds, day_settings, extra_facts, extra_facts_ru, retention_days)
select
  1,
  d -> 'weights',
  d -> 'thresholds',
  d -> 'day_settings',
  '',
  '',
  (d ->> 'retention_days')::integer
from (
  select $defaults$
{
  "weights": {
    "1": { "partA": 40, "partB": 60 },
    "2": { "partA": 40, "partB": 60 },
    "3": { "partA": 40, "partB": 60 },
    "4": { "partA": 20, "partB": 80 }
  },
  "thresholds": { "green": 80, "yellow": 60 },
  "day_settings": {
    "1": { "itemCount": 12, "itemSeconds": 60, "minTurns": 6, "maxTurns": 8, "partBMinutes": 20 },
    "2": { "itemCount": 12, "itemSeconds": 60, "minTurns": 8, "maxTurns": 10, "partBMinutes": 20 },
    "3": { "itemCount": 10, "itemSeconds": 60, "minTurns": 8, "maxTurns": 10, "partBMinutes": 20 },
    "4": { "itemCount": 6, "itemSeconds": 90, "minTurns": 10, "maxTurns": 14, "partBMinutes": 20 }
  },
  "retention_days": 365
}
$defaults$::jsonb as d
) as defaults
on conflict (id) do nothing;

-- PostgREST picks up new tables and functions from its schema cache; Supabase
-- reloads it on DDL, and this makes sure of it.
notify pgrst, 'reload schema';

commit;
