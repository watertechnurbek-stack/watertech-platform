-- People analytics checks — run against the STAGING project only (see docs/TESTING.md).
--
-- Paste the whole file into the Supabase SQL editor and run it once, after
-- 0021_people_analytics.sql and 0022_person_removal.sql. It adds six allow-list rows (emails
-- `people-*@test`: two operators, a sales manager, an admin, an inactive
-- operator with no events and one whose only event is after the window) and
-- ~70 telemetry_events, all in March 2001, so no real event can fall inside
-- the windows. Then, as an admin, it calls the six people functions and
-- compares each result, column by column, with the expected rows below;
-- checks the totals against the 0016 dashboard functions for the same
-- window; and checks that an operator, a sales manager and a claim-less
-- token get WT403, that bad arguments get WT400, and that only
-- `authenticated` holds EXECUTE. After 0022 it also purges one person's
-- history with admin_purge_person_history() — counted against the fixture,
-- everybody else's rows untouched, the refusals (a stale admin token, self,
-- admin rows, an empty email) — see "The history purge" near the end.
-- Everything runs in one transaction that ends
-- in ROLLBACK, and a failed assertion aborts it — either way no fixture row is
-- ever committed. The allow-list rows are inserted before any role switch: an
-- admin row may only be written without a JWT (WT462, 0020).
--
--   Passed: the last result is a single row "People checks passed".
--   Failed: an error whose message starts with "PEOPLE FAIL:".
--
-- ONE DOCUMENT FOR BOTH SIDES. The JSON between the two `$people$` markers is
-- the fixture AND the expected results, written as PostgREST returns them
-- (timestamps in UTC as "+00:00", bigint as numbers). tests/unit/admin/people.test.ts
-- reads this very file and runs the expected rows through the mappers of
-- lib/admin/people.ts, so a column the SQL renames or retypes fails one of the
-- two suites.
--
-- What the fixture exercises: events exactly on p_from (in) and p_to (out, but
-- it is the person's last_seen_at), on both sides of a Tashkent midnight and of
-- the current/previous boundary; an idle pair, and one longer than the page time
-- (clamped to 0 in the total and in its day); a day without events inside the
-- window (zero-filled) and a window not aligned to midnight; two sessions on
-- one day; call counts typed as a running value ("2" then "25"), as a JSON
-- number, and cleared ("");
-- checklist toggles undone and truthy strings; copies with an entity, without
-- one, of a type with no view event ("contact"), and of an item never viewed;
-- a view keyed by path; page_leave paths with /ru and /uz prefixes and one
-- that merely starts with "ru" (/ruxsat); a person active only after the
-- window, who must sort after everyone active in it; an admin
-- whose pre-0020 events must not count anywhere; an email no longer on the
-- allow-list whose events still count in admin_top_content, and a checklist
-- toggle of theirs exactly on p_to that must not count; an unknown email.

begin;

-- Timestamps compare in PostgREST's text form ("…+00:00") whatever the
-- editor's session zone is.
set local timezone to 'UTC';

select set_config('people_checks.doc', $people$
{
  "range": { "from": "2001-03-10", "to": "2001-03-12" },
  "windows": {
    "from": "2001-03-09T19:00:00.000Z",
    "to": "2001-03-12T19:00:00.000Z",
    "prevFrom": "2001-03-06T19:00:00.000Z"
  },
  "members": [
    { "email": "people-op1@test", "role": "operator", "full_name": "Ali Valiyev", "is_active": true, "added_at": "2001-02-01T00:00:00.000Z" },
    { "email": "people-op2@test", "role": "operator", "full_name": null, "is_active": true, "added_at": "2001-02-02T00:00:00.000Z" },
    { "email": "people-mgr@test", "role": "manager", "full_name": "Olga Petrova", "is_active": true, "added_at": "2001-02-03T00:00:00.000Z" },
    { "email": "people-admin@test", "role": "admin", "full_name": "Owner", "is_active": true, "added_at": "2001-02-04T00:00:00.000Z" },
    { "email": "people-off@test", "role": "operator", "full_name": "Old Operator", "is_active": false, "added_at": "2001-02-05T00:00:00.000Z" },
    { "email": "people-late@test", "role": "operator", "full_name": "Late Joiner", "is_active": true, "added_at": "2001-02-06T00:00:00.000Z" }
  ],
  "events": [
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-09T19:00:00.000Z", "type": "page_enter", "path": "/" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:00:00.000Z", "type": "page_enter", "path": "/sales-process/scripts" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:01:00.000Z", "type": "script_select", "path": "/sales-process/scripts", "entity_type": "script", "entity_id": "lead-orqali-tushgan" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:02:00.000Z", "type": "stage_view", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:03:00.000Z", "type": "copy", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:04:00.000Z", "type": "copy", "path": "/sales-process/scripts" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:05:00.000Z", "type": "idle_start", "path": "/ru/sales-process/scripts" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:07:00.000Z", "type": "idle_end", "path": "/ru/sales-process/scripts" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:10:00.000Z", "type": "page_leave", "path": "/sales-process/scripts", "duration_ms": 600000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:11:00.000Z", "type": "objection_view", "path": "/sales-process/scripts", "entity_type": "objection", "entity_id": "obj-qimmat" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:12:00.000Z", "type": "copy", "path": "/sales-process/scripts", "entity_type": "objection", "entity_id": "obj-qimmat" },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:13:00.000Z", "type": "search", "path": "/", "meta": { "query": "kafolat", "resultCount": 0 } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:14:00.000Z", "type": "search", "path": "/", "meta": { "query": "narx", "resultCount": 3 } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:15:00.000Z", "type": "copilot_ask", "path": "/", "meta": { "hits": 2, "chars": 30 } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:16:00.000Z", "type": "call_count_log", "path": "/", "entity_type": "daily_task", "entity_id": "1", "meta": { "count": "2" } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:17:00.000Z", "type": "call_count_log", "path": "/", "entity_type": "daily_task", "entity_id": "1", "meta": { "count": "25" } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:18:00.000Z", "type": "call_count_log", "path": "/", "entity_type": "daily_task", "entity_id": "2", "meta": { "count": 7 } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:19:00.000Z", "type": "call_count_log", "path": "/", "entity_type": "daily_task", "entity_id": "3", "meta": { "count": "4" } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:20:00.000Z", "type": "call_count_log", "path": "/", "entity_type": "daily_task", "entity_id": "3", "meta": { "count": "" } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:21:00.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-1", "meta": { "checked": true } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:22:00.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-2", "meta": { "checked": true } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:23:00.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-2", "meta": { "checked": false } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:30:00.000Z", "type": "page_leave", "path": "/ru/faq", "duration_ms": 60000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:31:00.000Z", "type": "page_leave", "path": "/uz", "duration_ms": 30000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T04:32:00.000Z", "type": "web_vital", "path": "/", "meta": { "name": "LCP", "value": 1200, "rating": "good" } },
    { "user_email": "people-op1@test", "session_id": "p-op1-a", "ts": "2001-03-10T18:59:59.999Z", "type": "page_leave", "path": "/", "duration_ms": 5000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:00:00.000Z", "type": "page_enter", "path": "/products" },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:01:00.000Z", "type": "package_view", "path": "/products", "entity_type": "package", "entity_id": "pkg-1" },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:02:00.000Z", "type": "copy", "path": "/products", "entity_type": "package", "entity_id": "pkg-1" },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:03:00.000Z", "type": "faq_view", "path": "/sales-process/scripts", "entity_type": "faq", "entity_id": "Narxi qancha?" },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:04:00.000Z", "type": "copy", "path": "/sales-process/scripts", "entity_type": "faq", "entity_id": "Narxi qancha?" },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:05:00.000Z", "type": "call_count_log", "path": "/", "entity_type": "daily_task", "entity_id": "1", "meta": { "count": "3" } },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:10:00.000Z", "type": "page_leave", "path": "/products", "duration_ms": 120000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T05:11:00.000Z", "type": "page_leave", "path": "/ru", "duration_ms": 1000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T18:59:59.999Z", "type": "copy", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-op1@test", "session_id": "p-op1-b", "ts": "2001-03-12T19:00:00.000Z", "type": "page_enter", "path": "/" },
    { "user_email": "people-op1@test", "session_id": "p-op1-p", "ts": "2001-03-08T05:00:00.000Z", "type": "page_leave", "path": "/faq", "duration_ms": 90000 },
    { "user_email": "people-op1@test", "session_id": "p-op1-p", "ts": "2001-03-08T05:01:00.000Z", "type": "search", "path": "/", "meta": { "query": "x", "resultCount": 0 } },
    { "user_email": "people-op1@test", "session_id": "p-op1-p", "ts": "2001-03-09T18:59:59.999Z", "type": "copy", "path": "/" },
    { "user_email": "people-op1@test", "session_id": "p-op1-old", "ts": "2001-03-01T05:00:00.000Z", "type": "page_enter", "path": "/" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:00:00.000Z", "type": "page_enter", "path": "/sales-process/scripts" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:01:00.000Z", "type": "stage_view", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:02:00.000Z", "type": "stage_view", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:03:00.000Z", "type": "copy", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:04:00.000Z", "type": "objection_view", "path": "/sales-process/scripts", "entity_type": "objection", "entity_id": "obj-qimmat" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:05:00.000Z", "type": "search", "path": "/", "meta": { "query": "Truba", "resultCount": 0 } },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:06:00.000Z", "type": "idle_start", "path": "/sales-process/scripts" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:36:00.000Z", "type": "idle_end", "path": "/sales-process/scripts" },
    { "user_email": "people-op2@test", "session_id": "p-op2-a", "ts": "2001-03-10T06:40:00.000Z", "type": "page_leave", "path": "/sales-process/scripts", "duration_ms": 600000 },
    { "user_email": "people-op2@test", "session_id": "p-op2-c", "ts": "2001-03-10T12:00:00.000Z", "type": "copilot_ask", "path": "/", "meta": { "hits": 0, "chars": 10 } },
    { "user_email": "people-op2@test", "session_id": "p-op2-b", "ts": "2001-03-10T19:00:00.000Z", "type": "page_enter", "path": "/company/onboarding" },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:00:00.000Z", "type": "page_enter", "path": "/sales-process/scripts" },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:01:00.000Z", "type": "stage_view", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:02:00.000Z", "type": "stage_view", "path": "/sales-process/scripts/lead-orqali-tushgan" },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:03:00.000Z", "type": "competitor_view", "path": "/sales-process/battle-cards/comp-x", "entity_type": "competitor", "entity_id": "comp-x" },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:10:00.000Z", "type": "page_leave", "path": "/sales-process/scripts", "duration_ms": 300000 },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:11:00.000Z", "type": "page_leave", "path": "/company/contacts", "duration_ms": 100000 },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:11:30.000Z", "type": "page_leave", "path": "/ruxsat/x", "duration_ms": 2000 },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:12:00.000Z", "type": "copy", "path": "/company/contacts", "entity_type": "contact", "entity_id": "sales-support" },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:13:00.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-1", "meta": { "checked": true } },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:13:30.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-2", "meta": { "checked": "yes" } },
    { "user_email": "people-mgr@test", "session_id": "p-mgr-a", "ts": "2001-03-11T09:14:00.000Z", "type": "copy", "path": "/sales-process/objections", "entity_type": "objection", "entity_id": "obj-arzon" },
    { "user_email": "people-admin@test", "session_id": "p-adm-a", "ts": "2001-03-10T08:00:00.000Z", "type": "page_enter", "path": "/admin" },
    { "user_email": "people-admin@test", "session_id": "p-adm-a", "ts": "2001-03-10T08:01:00.000Z", "type": "stage_view", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-admin@test", "session_id": "p-adm-a", "ts": "2001-03-10T08:02:00.000Z", "type": "copy", "path": "/sales-process/scripts", "entity_type": "stage", "entity_id": "st-1" },
    { "user_email": "people-admin@test", "session_id": "p-adm-a", "ts": "2001-03-10T08:03:00.000Z", "type": "search", "path": "/", "meta": { "query": "test", "resultCount": 0 } },
    { "user_email": "people-admin@test", "session_id": "p-adm-a", "ts": "2001-03-10T08:04:00.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-1", "meta": { "checked": true } },
    { "user_email": "people-admin@test", "session_id": "p-adm-a", "ts": "2001-03-10T08:05:00.000Z", "type": "page_leave", "path": "/admin", "duration_ms": 60000 },
    { "user_email": "people-gone@test", "session_id": "p-gone-a", "ts": "2001-03-11T10:00:00.000Z", "type": "objection_view", "path": "/sales-process/scripts", "entity_type": "objection", "entity_id": "obj-qimmat" },
    { "user_email": "people-gone@test", "session_id": "p-gone-a", "ts": "2001-03-12T19:00:00.000Z", "type": "checklist_toggle", "path": "/company/onboarding", "entity_type": "onboarding_item", "entity_id": "item-1", "meta": { "checked": true } },
    { "user_email": "people-late@test", "session_id": "p-late-a", "ts": "2001-03-20T05:00:00.000Z", "type": "page_enter", "path": "/" }
  ],
  "expected": {
    "overview": [
      {
        "member_email": "people-op1@test", "member_full_name": "Ali Valiyev", "member_role": "operator", "member_is_active": true,
        "member_added_at": "2001-02-01T00:00:00+00:00",
        "first_seen_at": "2001-03-01T05:00:00+00:00", "last_seen_at": "2001-03-12T19:00:00+00:00",
        "active_ms": 696000, "active_days": 2, "sessions": 2, "content_views": 5, "copies": 6, "searches": 2,
        "zero_result_searches": 1, "copilot_asks": 1, "calls_logged": 35, "checklist_completed": 1,
        "daily": [
          { "day": "2001-03-10", "active_ms": 575000, "events": 26 },
          { "day": "2001-03-11", "active_ms": 0, "events": 0 },
          { "day": "2001-03-12", "active_ms": 121000, "events": 9 }
        ]
      },
      {
        "member_email": "people-mgr@test", "member_full_name": "Olga Petrova", "member_role": "manager", "member_is_active": true,
        "member_added_at": "2001-02-03T00:00:00+00:00",
        "first_seen_at": "2001-03-11T09:00:00+00:00", "last_seen_at": "2001-03-11T09:14:00+00:00",
        "active_ms": 402000, "active_days": 1, "sessions": 1, "content_views": 3, "copies": 2, "searches": 0,
        "zero_result_searches": 0, "copilot_asks": 0, "calls_logged": 0, "checklist_completed": 2,
        "daily": [
          { "day": "2001-03-10", "active_ms": 0, "events": 0 },
          { "day": "2001-03-11", "active_ms": 402000, "events": 11 },
          { "day": "2001-03-12", "active_ms": 0, "events": 0 }
        ]
      },
      {
        "member_email": "people-op2@test", "member_full_name": null, "member_role": "operator", "member_is_active": true,
        "member_added_at": "2001-02-02T00:00:00+00:00",
        "first_seen_at": "2001-03-10T06:00:00+00:00", "last_seen_at": "2001-03-10T19:00:00+00:00",
        "active_ms": 0, "active_days": 2, "sessions": 3, "content_views": 3, "copies": 1, "searches": 1,
        "zero_result_searches": 1, "copilot_asks": 1, "calls_logged": 0, "checklist_completed": 0,
        "daily": [
          { "day": "2001-03-10", "active_ms": 0, "events": 10 },
          { "day": "2001-03-11", "active_ms": 0, "events": 1 },
          { "day": "2001-03-12", "active_ms": 0, "events": 0 }
        ]
      },
      {
        "member_email": "people-late@test", "member_full_name": "Late Joiner", "member_role": "operator", "member_is_active": true,
        "member_added_at": "2001-02-06T00:00:00+00:00",
        "first_seen_at": "2001-03-20T05:00:00+00:00", "last_seen_at": "2001-03-20T05:00:00+00:00",
        "active_ms": 0, "active_days": 0, "sessions": 0, "content_views": 0, "copies": 0, "searches": 0,
        "zero_result_searches": 0, "copilot_asks": 0, "calls_logged": 0, "checklist_completed": 0,
        "daily": [
          { "day": "2001-03-10", "active_ms": 0, "events": 0 },
          { "day": "2001-03-11", "active_ms": 0, "events": 0 },
          { "day": "2001-03-12", "active_ms": 0, "events": 0 }
        ]
      },
      {
        "member_email": "people-admin@test", "member_full_name": "Owner", "member_role": "admin", "member_is_active": true,
        "member_added_at": "2001-02-04T00:00:00+00:00",
        "first_seen_at": null, "last_seen_at": null,
        "active_ms": 0, "active_days": 0, "sessions": 0, "content_views": 0, "copies": 0, "searches": 0,
        "zero_result_searches": 0, "copilot_asks": 0, "calls_logged": 0, "checklist_completed": 0,
        "daily": [
          { "day": "2001-03-10", "active_ms": 0, "events": 0 },
          { "day": "2001-03-11", "active_ms": 0, "events": 0 },
          { "day": "2001-03-12", "active_ms": 0, "events": 0 }
        ]
      },
      {
        "member_email": "people-off@test", "member_full_name": "Old Operator", "member_role": "operator", "member_is_active": false,
        "member_added_at": "2001-02-05T00:00:00+00:00",
        "first_seen_at": null, "last_seen_at": null,
        "active_ms": 0, "active_days": 0, "sessions": 0, "content_views": 0, "copies": 0, "searches": 0,
        "zero_result_searches": 0, "copilot_asks": 0, "calls_logged": 0, "checklist_completed": 0,
        "daily": [
          { "day": "2001-03-10", "active_ms": 0, "events": 0 },
          { "day": "2001-03-11", "active_ms": 0, "events": 0 },
          { "day": "2001-03-12", "active_ms": 0, "events": 0 }
        ]
      }
    ],
    "summary": {
      "people-op1@test": {
        "active_ms": 696000, "active_ms_prev": 90000,
        "active_days": 2, "active_days_prev": 2,
        "sessions": 2, "sessions_prev": 1,
        "content_views": 5, "content_views_prev": 0,
        "copies": 6, "copies_prev": 1,
        "searches": 2, "searches_prev": 1,
        "zero_result_searches": 1, "zero_result_searches_prev": 1,
        "copilot_asks": 1, "copilot_asks_prev": 0,
        "calls_logged": 35, "calls_logged_prev": 0,
        "checklist_completed": 1, "checklist_completed_prev": 0,
        "first_seen_at": "2001-03-01T05:00:00+00:00", "last_seen_at": "2001-03-12T19:00:00+00:00"
      },
      "people-admin@test": {
        "active_ms": 0, "active_ms_prev": 0,
        "active_days": 0, "active_days_prev": 0,
        "sessions": 0, "sessions_prev": 0,
        "content_views": 0, "content_views_prev": 0,
        "copies": 0, "copies_prev": 0,
        "searches": 0, "searches_prev": 0,
        "zero_result_searches": 0, "zero_result_searches_prev": 0,
        "copilot_asks": 0, "copilot_asks_prev": 0,
        "calls_logged": 0, "calls_logged_prev": 0,
        "checklist_completed": 0, "checklist_completed_prev": 0,
        "first_seen_at": null, "last_seen_at": null
      },
      "people-nobody@test": {
        "active_ms": 0, "active_ms_prev": 0,
        "active_days": 0, "active_days_prev": 0,
        "sessions": 0, "sessions_prev": 0,
        "content_views": 0, "content_views_prev": 0,
        "copies": 0, "copies_prev": 0,
        "searches": 0, "searches_prev": 0,
        "zero_result_searches": 0, "zero_result_searches_prev": 0,
        "copilot_asks": 0, "copilot_asks_prev": 0,
        "calls_logged": 0, "calls_logged_prev": 0,
        "checklist_completed": 0, "checklist_completed_prev": 0,
        "first_seen_at": null, "last_seen_at": null
      },
      "people-gone@test": {
        "active_ms": 0, "active_ms_prev": 0,
        "active_days": 1, "active_days_prev": 0,
        "sessions": 1, "sessions_prev": 0,
        "content_views": 1, "content_views_prev": 0,
        "copies": 0, "copies_prev": 0,
        "searches": 0, "searches_prev": 0,
        "zero_result_searches": 0, "zero_result_searches_prev": 0,
        "copilot_asks": 0, "copilot_asks_prev": 0,
        "calls_logged": 0, "calls_logged_prev": 0,
        "checklist_completed": 0, "checklist_completed_prev": 0,
        "first_seen_at": "2001-03-11T10:00:00+00:00", "last_seen_at": "2001-03-12T19:00:00+00:00"
      }
    },
    "daily": {
      "people-op1@test": [
        { "day": "2001-03-10", "active_ms": 575000, "events": 26, "content_views": 3 },
        { "day": "2001-03-11", "active_ms": 0, "events": 0, "content_views": 0 },
        { "day": "2001-03-12", "active_ms": 121000, "events": 9, "content_views": 2 }
      ],
      "people-op2@test": [
        { "day": "2001-03-10", "active_ms": 0, "events": 10, "content_views": 3 },
        { "day": "2001-03-11", "active_ms": 0, "events": 1, "content_views": 0 },
        { "day": "2001-03-12", "active_ms": 0, "events": 0, "content_views": 0 }
      ],
      "people-admin@test": [
        { "day": "2001-03-10", "active_ms": 0, "events": 0, "content_views": 0 },
        { "day": "2001-03-11", "active_ms": 0, "events": 0, "content_views": 0 },
        { "day": "2001-03-12", "active_ms": 0, "events": 0, "content_views": 0 }
      ]
    },
    "sections": {
      "people-op1@test": [
        { "section": "sales-process", "active_ms": 600000, "visits": 1 },
        { "section": "products", "active_ms": 120000, "visits": 1 },
        { "section": "faq", "active_ms": 60000, "visits": 1 },
        { "section": "home", "active_ms": 36000, "visits": 3 }
      ],
      "people-mgr@test": [
        { "section": "sales-process", "active_ms": 300000, "visits": 1 },
        { "section": "company", "active_ms": 100000, "visits": 1 },
        { "section": "ruxsat", "active_ms": 2000, "visits": 1 }
      ],
      "people-admin@test": []
    },
    "recent_events": {
      "people-op1@test": [
        { "event_ts": "2001-03-12T19:00:00+00:00", "event_type": "page_enter", "event_path": "/", "event_entity_type": null, "event_entity_id": null, "event_meta": null },
        { "event_ts": "2001-03-12T18:59:59.999+00:00", "event_type": "copy", "event_path": "/sales-process/scripts", "event_entity_type": "stage", "event_entity_id": "st-1", "event_meta": null },
        { "event_ts": "2001-03-12T05:05:00+00:00", "event_type": "call_count_log", "event_path": "/", "event_entity_type": "daily_task", "event_entity_id": "1", "event_meta": { "count": "3" } }
      ],
      "people-mgr@test": [
        { "event_ts": "2001-03-11T09:14:00+00:00", "event_type": "copy", "event_path": "/sales-process/objections", "event_entity_type": "objection", "event_entity_id": "obj-arzon", "event_meta": null },
        { "event_ts": "2001-03-11T09:13:30+00:00", "event_type": "checklist_toggle", "event_path": "/company/onboarding", "event_entity_type": "onboarding_item", "event_entity_id": "item-2", "event_meta": { "checked": "yes" } },
        { "event_ts": "2001-03-11T09:13:00+00:00", "event_type": "checklist_toggle", "event_path": "/company/onboarding", "event_entity_type": "onboarding_item", "event_entity_id": "item-1", "event_meta": { "checked": true } }
      ],
      "people-admin@test": []
    },
    "top_content": [
      { "view_type": "stage_view", "view_entity_id": "st-1", "view_path": "/sales-process/scripts", "views": 4, "copies": 3, "people": 3 },
      { "view_type": "objection_view", "view_entity_id": "obj-qimmat", "view_path": "/sales-process/scripts", "views": 3, "copies": 1, "people": 3 },
      { "view_type": "package_view", "view_entity_id": "pkg-1", "view_path": "/products", "views": 1, "copies": 1, "people": 1 },
      { "view_type": "faq_view", "view_entity_id": "Narxi qancha?", "view_path": "/sales-process/scripts", "views": 1, "copies": 1, "people": 1 },
      { "view_type": "script_select", "view_entity_id": "lead-orqali-tushgan", "view_path": "/sales-process/scripts", "views": 1, "copies": 0, "people": 1 },
      { "view_type": "stage_view", "view_entity_id": null, "view_path": "/sales-process/scripts/lead-orqali-tushgan", "views": 1, "copies": 0, "people": 1 },
      { "view_type": "competitor_view", "view_entity_id": "comp-x", "view_path": "/sales-process/battle-cards/comp-x", "views": 1, "copies": 0, "people": 1 },
      { "view_type": "objection_view", "view_entity_id": "obj-arzon", "view_path": "/sales-process/objections", "views": 0, "copies": 1, "people": 1 }
    ]
  }
}
$people$, true);

-- === Fixtures (as the editor's own role, before any role switch) ===============
-- `order by n` keeps the document's order, so event ids ascend with it.

insert into public.allowed_users (email, role, full_name, is_active, created_at)
select
  m ->> 'email',
  m ->> 'role',
  m ->> 'full_name',
  (m ->> 'is_active')::boolean,
  (m ->> 'added_at')::timestamptz
from jsonb_array_elements(current_setting('people_checks.doc')::jsonb -> 'members') as m;

insert into public.telemetry_events (user_email, session_id, ts, type, path, entity_type, entity_id, duration_ms, meta)
select
  f.ev ->> 'user_email',
  f.ev ->> 'session_id',
  (f.ev ->> 'ts')::timestamptz,
  f.ev ->> 'type',
  f.ev ->> 'path',
  f.ev ->> 'entity_type',
  f.ev ->> 'entity_id',
  (f.ev ->> 'duration_ms')::integer,
  nullif(f.ev -> 'meta', 'null'::jsonb)
from jsonb_array_elements(current_setting('people_checks.doc')::jsonb -> 'events') with ordinality as f(ev, n)
order by f.n;

-- === As an admin: every function against the expected rows ====================

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"people-checker@test","app_metadata":{"role":"admin"}}';

do $$
declare
  doc constant jsonb := current_setting('people_checks.doc')::jsonb;
  expected constant jsonb := doc -> 'expected';
  w_from constant timestamptz := (doc -> 'windows' ->> 'from')::timestamptz;
  w_to constant timestamptz := (doc -> 'windows' ->> 'to')::timestamptz;
  w_prev constant timestamptz := (doc -> 'windows' ->> 'prevFrom')::timestamptz;
  person text;
  actual jsonb;
  op record;
  day_sum bigint;
begin
  if current_user <> 'authenticated' or to_regprocedure('private.is_admin()') is null or not private.is_admin() then
    raise exception 'PEOPLE FAIL: setup — expected authenticated/admin, got %/% (are 0020 and 0021 applied?)',
      current_user, private.app_role();
  end if;

  -- (a) The fixture rows of the overview, every column, in the function's
  -- order. Real staging rows are in the result too; they are left out here.
  actual := (
    select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
    from public.admin_people_overview(w_from, w_to) with ordinality r
    where r.member_email like 'people-%@test'
  );
  if actual is distinct from expected -> 'overview' then
    raise exception 'PEOPLE FAIL: admin_people_overview: expected %, got %', expected -> 'overview', actual;
  end if;

  -- Every allow-list row is there exactly once, fixture or not.
  if (select count(*) from public.admin_people_overview(w_from, w_to))
     is distinct from (select count(*) from public.allowed_users) then
    raise exception 'PEOPLE FAIL: admin_people_overview does not return one row per allowed_users row';
  end if;

  -- (b) Summary: a person, an admin with pre-0020 events, an unknown email
  -- (a zero row, not an error) and an email no longer on the allow-list.
  for person in select jsonb_object_keys(expected -> 'summary') loop
    actual := (
      select jsonb_agg(to_jsonb(r))
      from public.admin_person_summary(person, w_from, w_to, w_prev) r
    );
    if actual is distinct from jsonb_build_array(expected -> 'summary' -> person) then
      raise exception 'PEOPLE FAIL: admin_person_summary(%): expected %, got %',
        person, expected -> 'summary' -> person, actual;
    end if;
  end loop;

  -- (c) Daily, zero-filled.
  for person in select jsonb_object_keys(expected -> 'daily') loop
    actual := (
      select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
      from public.admin_person_daily(person, w_from, w_to) with ordinality r
    );
    if actual is distinct from expected -> 'daily' -> person then
      raise exception 'PEOPLE FAIL: admin_person_daily(%): expected %, got %', person, expected -> 'daily' -> person, actual;
    end if;
  end loop;

  -- A window that is not aligned to midnight still gets every day it touches:
  -- 15:00 on 10 March to 15:00 on 11 March (Tashkent) is two days.
  actual := (
    select jsonb_agg(r.day order by r.day)
    from public.admin_person_daily('people-off@test', '2001-03-10T10:00:00Z', '2001-03-11T10:00:00Z') r
  );
  if actual is distinct from '["2001-03-10", "2001-03-11"]'::jsonb then
    raise exception 'PEOPLE FAIL: admin_person_daily on a misaligned window: got %', actual;
  end if;

  -- (d) Sections: /ru and /uz stripped, '/' and a bare locale are 'home'.
  for person in select jsonb_object_keys(expected -> 'sections') loop
    actual := (
      select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
      from public.admin_person_sections(person, w_from, w_to) with ordinality r
    );
    if actual is distinct from expected -> 'sections' -> person then
      raise exception 'PEOPLE FAIL: admin_person_sections(%): expected %, got %', person, expected -> 'sections' -> person, actual;
    end if;
  end loop;

  -- (e) Recent events, three newest.
  for person in select jsonb_object_keys(expected -> 'recent_events') loop
    actual := (
      select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
      from public.admin_person_recent_events(person, 3) with ordinality r
    );
    if actual is distinct from expected -> 'recent_events' -> person then
      raise exception 'PEOPLE FAIL: admin_person_recent_events(%, 3): expected %, got %',
        person, expected -> 'recent_events' -> person, actual;
    end if;
  end loop;

  -- The default limit is 30: op1 has 40 events, 10 of them of the left-out
  -- types, so exactly 30 come back, newest first, the oldest (1 March) last.
  if (select count(*) from public.admin_person_recent_events('people-op1@test')) <> 30 then
    raise exception 'PEOPLE FAIL: admin_person_recent_events default limit: expected 30 rows';
  end if;
  if exists (
    select 1 from public.admin_person_recent_events('people-op1@test', 100) r
    where r.event_type in ('web_vital', 'idle_start', 'idle_end', 'page_leave')
  ) then
    raise exception 'PEOPLE FAIL: admin_person_recent_events returned a left-out event type';
  end if;
  if (
    select array_agg(r.event_ts order by r.ordinality)
    from public.admin_person_recent_events('people-op1@test', 100) with ordinality r
  ) is distinct from (
    select array_agg(r.event_ts order by r.event_ts desc)
    from public.admin_person_recent_events('people-op1@test', 100) r
  ) or (
    select r.event_ts from public.admin_person_recent_events('people-op1@test', 100) with ordinality r
    order by r.ordinality desc limit 1
  ) is distinct from '2001-03-01T05:00:00Z'::timestamptz then
    raise exception 'PEOPLE FAIL: admin_person_recent_events is not newest-first down to the oldest event';
  end if;

  -- (f) Top content, and p_limit cuts the ranked list without reordering it.
  actual := (
    select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
    from public.admin_top_content(w_from, w_to) with ordinality r
  );
  if actual is distinct from expected -> 'top_content' then
    raise exception 'PEOPLE FAIL: admin_top_content: expected %, got %', expected -> 'top_content', actual;
  end if;
  -- Three, because the ranking happens before the cut: the third item (1 view
  -- + 1 copy) must beat the earlier-seen items with 1 view and no copy.
  actual := (
    select coalesce(jsonb_agg(to_jsonb(r) - 'ordinality' order by r.ordinality), '[]'::jsonb)
    from public.admin_top_content(w_from, w_to, 3) with ordinality r
  );
  if actual is distinct from jsonb_path_query_array(expected -> 'top_content', '$[0 to 2]') then
    raise exception 'PEOPLE FAIL: admin_top_content(p_limit => 3) is not the first three rows: %', actual;
  end if;

  -- The same numbers as the 0016 dashboard functions for the same window, for
  -- every tracked fixture person.
  for op in
    select r.member_email, r.active_ms, r.copies, r.checklist_completed, r.zero_result_searches
    from public.admin_people_overview(w_from, w_to) r
    where r.member_email in ('people-op1@test', 'people-op2@test', 'people-mgr@test')
  loop
    if (select jsonb_build_object('active_ms', a.active_ms, 'copies', a.copy_count, 'checklist', a.checklist_completed)
          from public.dashboard_operator_activity(w_from, w_to, op.member_email) a)
       is distinct from jsonb_build_object('active_ms', op.active_ms, 'copies', op.copies, 'checklist', op.checklist_completed) then
      raise exception 'PEOPLE FAIL: % disagrees with dashboard_operator_activity', op.member_email;
    end if;
    if (select k.zero_result_searches from public.dashboard_kpis(w_from, w_to, w_prev, op.member_email) k)
       is distinct from op.zero_result_searches then
      raise exception 'PEOPLE FAIL: % disagrees with dashboard_kpis on zero-result searches', op.member_email;
    end if;
  end loop;

  -- op1's days add up to the window total (no day has more idle than page time).
  select sum(r.active_ms) into day_sum from public.admin_person_daily('people-op1@test', w_from, w_to) r;
  if day_sum is distinct from 696000::bigint then
    raise exception 'PEOPLE FAIL: op1''s daily active_ms sum to %, expected the window total 696000', day_sum;
  end if;

  -- The longest allowed window is exactly 93 days.
  perform public.admin_people_overview(w_to - interval '93 days', w_to);
  perform public.admin_person_recent_events('people-op1@test', 1);
  perform public.admin_top_content(w_from, w_to, 100);

  -- Bad arguments are refused, not answered with an empty result.
  for op in
    select * from (values
      ('p_from = p_to',               'select * from public.admin_people_overview(now(), now())'),
      ('p_from > p_to',               'select * from public.admin_people_overview(now(), now() - interval ''1 day'')'),
      ('null p_to',                   'select * from public.admin_people_overview(now(), null)'),
      ('a 93-day-and-1-µs window',    'select * from public.admin_people_overview(now() - interval ''93 days 1 microsecond'', now())'),
      ('an uppercase email',          'select * from public.admin_person_summary(''People-Op1@test'', now() - interval ''1 day'', now(), now() - interval ''2 days'')'),
      ('an empty email',              'select * from public.admin_person_summary('''', now() - interval ''1 day'', now(), now() - interval ''2 days'')'),
      ('a null email',                'select * from public.admin_person_daily(null, now() - interval ''1 day'', now())'),
      ('an untrimmed email',          'select * from public.admin_person_sections('' people-op1@test'', now() - interval ''1 day'', now())'),
      ('p_prev_from after p_from',    'select * from public.admin_person_summary(''people-op1@test'', now() - interval ''1 day'', now(), now())'),
      ('a 94-day previous window',    'select * from public.admin_person_summary(''people-op1@test'', now() - interval ''1 day'', now(), now() - interval ''95 days'')'),
      ('a 94-day daily window',       'select * from public.admin_person_daily(''people-op1@test'', now() - interval ''94 days'', now())'),
      ('p_limit = 0',                 'select * from public.admin_person_recent_events(''people-op1@test'', 0)'),
      ('p_limit = 101',               'select * from public.admin_person_recent_events(''people-op1@test'', 101)'),
      ('p_limit = null',              'select * from public.admin_top_content(now() - interval ''1 day'', now(), null)'),
      ('p_limit = 101 (top content)', 'select * from public.admin_top_content(now() - interval ''1 day'', now(), 101)')
    ) as t(label, sql)
  loop
    begin
      execute op.sql;
      raise exception 'PEOPLE FAIL: accepted %', op.label;
    exception when others then
      if sqlstate <> 'WT400' then
        raise exception 'PEOPLE FAIL: % got % (%), expected WT400', op.label, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
end $$;

-- === Everyone else is refused =================================================
-- An operator, a sales manager and a claim-less token hold EXECUTE (they are
-- `authenticated`) and must be stopped by the is_admin() check inside each
-- function (WT403) — not merely answered with zeros because RLS hid the rows.

do $$
declare
  ident record;
  call record;
begin
  for ident in
    select * from (values
      ('an operator',
        '{"sub":"00000000-0000-4000-8000-0000000000e2","role":"authenticated","email":"people-op1@test","app_metadata":{"role":"operator"}}'),
      ('a sales manager',
        '{"sub":"00000000-0000-4000-8000-0000000000e3","role":"authenticated","email":"people-mgr@test","app_metadata":{"role":"manager"}}'),
      ('a token without a role claim',
        '{"sub":"00000000-0000-4000-8000-0000000000e4","role":"authenticated","email":"people-x@test"}')
    ) as t(label, claims)
  loop
    perform set_config('request.jwt.claims', ident.claims, true);

    for call in
      select * from (values
        ('admin_people_overview',      'select * from public.admin_people_overview(now() - interval ''1 day'', now())'),
        ('admin_person_summary',       'select * from public.admin_person_summary(''people-op1@test'', now() - interval ''1 day'', now(), now() - interval ''2 days'')'),
        ('admin_person_daily',         'select * from public.admin_person_daily(''people-op1@test'', now() - interval ''1 day'', now())'),
        ('admin_person_sections',      'select * from public.admin_person_sections(''people-op1@test'', now() - interval ''1 day'', now())'),
        ('admin_person_recent_events', 'select * from public.admin_person_recent_events(''people-op1@test'')'),
        ('admin_top_content',          'select * from public.admin_top_content(now() - interval ''1 day'', now())'),
        -- Re-created by 0021 around the shared checklist helper.
        ('dashboard_operator_activity', 'select * from public.dashboard_operator_activity(now() - interval ''1 day'', now())'),
        -- 0022: refused before it reads or deletes anything.
        ('admin_purge_person_history', 'select public.admin_purge_person_history(''people-op1@test'')')
      ) as t(fn, sql)
    loop
      begin
        execute call.sql;
        raise exception 'PEOPLE FAIL: % can call public.%()', ident.label, call.fn;
      exception when others then
        if sqlstate <> 'WT403' then
          raise exception 'PEOPLE FAIL: % calling public.%() got % (%), expected WT403',
            ident.label, call.fn, sqlstate, sqlerrm;
        end if;
      end;
    end loop;
  end loop;
end $$;

-- === The history purge (0022) ==================================================
-- admin_purge_person_history() deletes one person's telemetry_events,
-- user_state and copilot_logs rows. It reads the caller's allow-list row like
-- the guard does, so it is called as people-admin@test (an active admin row);
-- people-checker@test, whom every check above ran as, has an admin claim but
-- no row — a stale admin token to this function. people-op2@test keeps their
-- allow-list row throughout: the purge must not need it gone.
--
-- The extra fixtures go in as the editor's own role: two more admin rows (only
-- a JWT-less session may write those, WT462) and user_state / copilot_logs
-- rows, which no session role may insert for somebody else.

reset role;
set local request.jwt.claims = '';

insert into public.allowed_users (email, role, is_active) values
  ('people-admin-2@test', 'admin', true),
  ('people-admin-off@test', 'admin', false);
insert into public.user_state (user_email, key, value) values
  ('people-op2@test', 'onboarding.v2', '{"summary-d1":true}'),
  ('people-op2@test', 'pins', '[]'),
  ('people-op1@test', 'pins', '[]');
insert into public.copilot_logs (email, question, status) values
  ('people-op2@test', 'people-checks question', 'ok'),
  ('people-op2@test', null, 'no_hits'),
  ('people-op1@test', 'people-checks question', 'ok');

set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e1","role":"authenticated","email":"people-checker@test","app_metadata":{"role":"admin"}}';

do $$
begin
  perform public.admin_purge_person_history('people-op2@test');
  raise exception 'PEOPLE FAIL: an admin claim without an active admin row can purge a history';
exception when sqlstate 'WT403' then null;
end $$;

set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000000e5","role":"authenticated","email":"people-admin@test","app_metadata":{"role":"admin"}}';

do $$
declare
  doc constant jsonb := current_setting('people_checks.doc')::jsonb;
  op2_events bigint;
  op1_events bigint;
  gone_events bigint;
  audit_rows bigint;
  purged jsonb;
  expected jsonb;
begin
  select count(*) into op2_events
  from jsonb_array_elements(doc -> 'events') e where e ->> 'user_email' = 'people-op2@test';
  select count(*) into op1_events
  from jsonb_array_elements(doc -> 'events') e where e ->> 'user_email' = 'people-op1@test';
  select count(*) into gone_events
  from jsonb_array_elements(doc -> 'events') e where e ->> 'user_email' = 'people-gone@test';
  if op2_events = 0 or gone_events = 0
     or (select count(*) from public.telemetry_events where user_email = 'people-op2@test') <> op2_events then
    raise exception 'PEOPLE FAIL: setup — the purge fixture is not what the document says';
  end if;
  select count(*) into audit_rows from public.access_audit;

  -- Normalised argument; counts per table; the purged rows are gone.
  -- 0023 adds three attestation counts to the result; this fixture has no
  -- attestation rows, so only 0022's three are compared here
  -- (attestation-checks.sql covers the rest).
  purged := public.admin_purge_person_history('  People-Op2@TEST ')
    - array['assessment_attempts', 'assessment_messages', 'assessment_unlocks'];
  expected := jsonb_build_object('telemetry', op2_events, 'user_state', 2, 'copilot', 2);
  if purged is distinct from expected then
    raise exception 'PEOPLE FAIL: admin_purge_person_history(people-op2): expected %, got %', expected, purged;
  end if;
  if exists (select 1 from public.telemetry_events where user_email = 'people-op2@test')
     or exists (select 1 from public.user_state where user_email = 'people-op2@test')
     or exists (select 1 from public.copilot_logs where email = 'people-op2@test') then
    raise exception 'PEOPLE FAIL: admin_purge_person_history left people-op2@test rows behind';
  end if;

  -- Only that person: everyone else's rows, the allow-list row and the audit
  -- trail are as they were.
  if (select count(*) from public.telemetry_events where user_email = 'people-op1@test') <> op1_events
     or (select count(*) from public.user_state where user_email = 'people-op1@test') <> 1
     or (select count(*) from public.copilot_logs where email = 'people-op1@test') <> 1 then
    raise exception 'PEOPLE FAIL: admin_purge_person_history deleted somebody else''s rows';
  end if;
  if not exists (select 1 from public.allowed_users where email = 'people-op2@test') then
    raise exception 'PEOPLE FAIL: admin_purge_person_history touched the allow-list row';
  end if;
  if (select count(*) from public.access_audit) <> audit_rows then
    raise exception 'PEOPLE FAIL: admin_purge_person_history wrote to or deleted from access_audit';
  end if;

  -- The person page reads nothing for them any more.
  if (select count(*) from public.admin_person_recent_events('people-op2@test', 100)) <> 0 then
    raise exception 'PEOPLE FAIL: the person page still has events after the purge';
  end if;

  -- Again: nothing left, zeros (a retried removal repeats its purge).
  purged := public.admin_purge_person_history('people-op2@test')
    - array['assessment_attempts', 'assessment_messages', 'assessment_unlocks'];
  if purged is distinct from '{"telemetry": 0, "user_state": 0, "copilot": 0}'::jsonb then
    raise exception 'PEOPLE FAIL: a repeated purge returned %, expected zeros', purged;
  end if;

  -- An email no longer on the allow-list is purged too.
  purged := public.admin_purge_person_history('people-gone@test')
    - array['assessment_attempts', 'assessment_messages', 'assessment_unlocks'];
  expected := jsonb_build_object('telemetry', gone_events, 'user_state', 0, 'copilot', 0);
  if purged is distinct from expected then
    raise exception 'PEOPLE FAIL: admin_purge_person_history(people-gone): expected %, got %', expected, purged;
  end if;

  -- The refusals, in the guard's order: self (WT461), then admin rows —
  -- active or inactive, and the caller's own row is "self" first (WT462);
  -- an empty or null email (WT400).
  begin
    perform public.admin_purge_person_history('PEOPLE-ADMIN@test');
    raise exception 'PEOPLE FAIL: an admin can purge their own history';
  exception when sqlstate 'WT461' then null;
  end;
  begin
    perform public.admin_purge_person_history('people-admin-2@test');
    raise exception 'PEOPLE FAIL: an admin can purge another admin''s history';
  exception when sqlstate 'WT462' then null;
  end;
  begin
    perform public.admin_purge_person_history('people-admin-off@test');
    raise exception 'PEOPLE FAIL: an admin can purge an inactive admin''s history';
  exception when sqlstate 'WT462' then null;
  end;
  begin
    perform public.admin_purge_person_history('');
    raise exception 'PEOPLE FAIL: admin_purge_person_history accepted an empty email';
  exception when sqlstate 'WT400' then null;
  end;
  begin
    perform public.admin_purge_person_history(null);
    raise exception 'PEOPLE FAIL: admin_purge_person_history accepted a null email';
  exception when sqlstate 'WT400' then null;
  end;
end $$;

-- The grants themselves (see dashboard-parity.sql for why this is checked on
-- the catalog rather than by calling as anon): only `authenticated` may execute
-- the functions and their helpers.

do $$
declare
  fn text;
  grantee text;
begin
  foreach fn in array array[
    'public.admin_purge_person_history(text)',
    'public.admin_people_overview(timestamptz, timestamptz)',
    'public.admin_person_summary(text, timestamptz, timestamptz, timestamptz)',
    'public.admin_person_daily(text, timestamptz, timestamptz)',
    'public.admin_person_sections(text, timestamptz, timestamptz)',
    'public.admin_person_recent_events(text, integer)',
    'public.admin_top_content(timestamptz, timestamptz, integer)',
    'public.dashboard_operator_activity(timestamptz, timestamptz, text)',
    'private.people_check_window(text, timestamptz, timestamptz)',
    'private.people_check_email(text, text)',
    'private.people_check_limit(text, integer)',
    'private.people_tracked_emails(text)',
    'private.dashboard_checklist_completed(timestamptz, timestamptz, text)',
    'private.people_window_days(timestamptz, timestamptz)',
    'private.people_activity(timestamptz, timestamptz, text[])',
    'private.people_daily_active_ms(timestamptz, timestamptz, text[])'
  ] loop
    if not has_function_privilege('authenticated', fn, 'execute') then
      raise exception 'PEOPLE FAIL: authenticated cannot execute % (missing GRANT)', fn;
    end if;
    foreach grantee in array array['anon', 'service_role'] loop
      if has_function_privilege(grantee, fn, 'execute') then
        raise exception 'PEOPLE FAIL: % can execute %', grantee, fn;
      end if;
    end loop;
  end loop;
end $$;

rollback;

select 'People checks passed' as result;
