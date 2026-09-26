-- Which of supabase/migrations/0001-0023 has this project had?
--
-- READ-ONLY. Safe on any project, production included: it reads the system
-- catalog and writes nothing. There is no migrations table in this project —
-- every file is pasted into the SQL editor by hand (docs/MIGRATIONS.md) — so
-- each file is recognised by an object that only it creates. Catalog lookups
-- answer false for a missing object instead of raising, so the same query works
-- on a project at any stage.
--
-- How to run: Supabase Dashboard → the project → SQL Editor → New query →
-- paste this file → Run. One row per migration, in apply order, then three
-- safety facts. Compare with the checklist in docs/MIGRATIONS.md; the next file
-- to apply is the first `false` row.
--
-- A `true` row only means that file's marker exists, not that the file ran to
-- the end: every file runs as one transaction, so in practice it is both.

with marker (migration, applied, evidence) as (
  values
    ('0001', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'custom_access_token_hook'),
     'function public.custom_access_token_hook'),
    ('0002', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_versions'),
     'table public.content_versions'),
    ('0003', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_scripts'
                       and has_table_privilege('authenticated', c.oid, 'SELECT')
                       and has_table_privilege('service_role', c.oid, 'SELECT')),
     'SELECT on content_scripts for authenticated and service_role'),
    ('0004', exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                     join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_scripts'
                       and a.attname = 'name_ru' and not a.attisdropped),
     'column content_scripts.name_ru'),
    ('0005', exists (select 1 from pg_policies
                     where schemaname = 'public' and tablename = 'allowed_users'
                       and policyname = 'allowed_users_manager_select_all'),
     'policy allowed_users_manager_select_all'),
    ('0006', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'copilot_logs'),
     'table public.copilot_logs'),
    ('0007', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_gate_reports'),
     'table public.content_gate_reports'),
    ('0008', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'rate_limit_hit'),
     'function public.rate_limit_hit'),
    ('0009', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'user_state'),
     'table public.user_state'),
    ('0010', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_changelog'),
     'table public.content_changelog'),
    ('0011', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_contacts'),
     'table public.content_contacts'),
    ('0012', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_sops'),
     'table public.content_sops'),
    ('0013', exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                     join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_versions'
                       and a.attname = 'op' and not a.attisdropped),
     'column content_versions.op'),
    ('0014', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and p.proname = 'is_member'),
     'function private.is_member'),
    ('0015', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'reorder_content_rows'),
     'function public.reorder_content_rows'),
    ('0016', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'run_retention'),
     'function public.run_retention'),
    ('0017', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'access_audit'),
     'table public.access_audit'),
    ('0018', exists (select 1 from pg_attribute a join pg_class c on c.oid = a.attrelid
                     join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'content_products'
                       and a.attname = 'image_path' and not a.attisdropped),
     'column content_products.image_path'),
    ('0019', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'copilot_stats'),
     'function public.copilot_stats'),
    ('0020', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'private' and p.proname = 'is_admin'),
     'function private.is_admin'),
    ('0021', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'admin_people_overview'),
     'function public.admin_people_overview'),
    ('0022', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'admin_purge_person_history'),
     'function public.admin_purge_person_history'),
    ('0023', exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                     where n.nspname = 'public' and c.relname = 'assessment_attempts'),
     'table public.assessment_attempts')
),
fact (migration, applied, evidence) as (
  -- Each of these should read `true` on a correctly configured project.
  values
    ('rls', not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                        where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
     'every table in public has row level security enabled'),
    ('anon', not exists (select 1 from pg_policies
                         where schemaname = 'public' and ('anon' = any (roles) or 'public' = any (roles))),
     'no policy in public names anon or public'),
    ('hook', exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                     where n.nspname = 'public' and p.proname = 'custom_access_token_hook'
                       and has_function_privilege('supabase_auth_admin', p.oid, 'EXECUTE')
                       and not has_function_privilege('authenticated', p.oid, 'EXECUTE')),
     'the access-token hook is callable by supabase_auth_admin only (enabling it is a dashboard step)')
)
select migration, applied, evidence from marker
union all
select migration, applied, evidence from fact;
