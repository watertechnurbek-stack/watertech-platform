# Attestatsiya — the four-day attestation

The owner asked for a Q&A test that feels like a real conversation, adapts to the factory's own data, runs over four
days, and whose results **only the admin ever sees** — scores as percentages with a colour status (green good, yellow
average, red poor). The answer is a hybrid **Attestatsiya**: every day has a deterministic knowledge check (**Part A**)
followed by a conversation with an AI customer (**Part B**). The FAQ page stays what it is: reference content.

This file is the specification. The roadmap steps are written against it:

| Step | Builds | Status |
| --- | --- | --- |
| **S04** | this spec; migration `0023_attestation.sql`; `supabase/tests/attestation-checks.sql`; `lib/attestation/*` (types, schemas, rubrics, scoring, schedule, item draw, config, repository, operator view); the admin item bank and settings; the results page's empty state; retention; the staging seed | **done** |
| S05 | the AI engine (customer persona + replies, evaluator) and the operator API (`app/api/attestation/**`), the fact sheet, Copilot refusal while an attempt is open | next |
| S06 | the operator UI (`app/[locale]/(app)/attestation`, `components/attestation/`) | — |
| S07 | the admin results UI (results matrix, person drill-down, override / reset / unlock, audit view) | — |

Rules marked **(hard)** are the security contract. Everything else is product behaviour that S05–S07 may refine by
changing this file in the same change.

## 1. Who

- **`operator` and `manager`** (sales manager) take the attestation. Both are the "candidate" roles.
- **`admin` never takes it** and is the **only reader of any result** (hard). An admin session gets `403
  not_a_candidate` from every candidate route (S05) and sees the whole picture in `/admin/assessments`.

## 2. The four days

Aligned with the onboarding programme (`lib/content/onboarding.ts`, days 1–4).

| Day | Focus | Part A (knowledge check) | Part B (AI customer) |
| --- | --- | --- | --- |
| 1 | Company & product basics | 12 items: company facts, product lines, value propositions, main competitor | first-time caller (homeowner / small shop owner), 6–8 operator turns |
| 2 | Technical product knowledge | 12 items: sizes, pressure classes, materials, installation, technical comparison | technical installer (usta) + one competitor claim, 8–10 turns |
| 3 | Client & CRM | 10 items: funnel stages, lead creation, task setting, loss reasons, SOPs, ideal client | dealer / wholesale buyer: needs discovery, terms and packages, correct next step, 8–10 turns |
| 4 | Full sales simulation | 6 situational-judgement items | full call, 10–14 turns, 2 objections from `content_objections` + 1 competitor claim, ends in a close or an agreed next step |

The item counts, time limits and turn ranges are **defaults** in `assessment_config.day_settings`, editable at
`/admin/assessments/settings`. Suggested Part A topics per day are `ITEM_TOPIC_SUGGESTIONS` in
`lib/attestation/types.ts` (the editor offers them; a topic is any slug).

## 3. Time

| Limit | Default | Enforced by |
| --- | --- | --- |
| Part A, per item | 60 s (day 4: 90 s) — `day_settings[d].itemSeconds` | the server (S05): an answer later than `served_at + itemSeconds + PART_A_GRACE_SECONDS` (5 s, `lib/attestation/config.ts`) scores as late = 0 (`scorePartA`) |
| Part B, whole session | 20 min — `day_settings[d].partBMinutes` | the server (S05): the next request after the limit submits the attempt |
| Part B, turns | `minTurns`–`maxTurns` operator turns per day | the server (S05): the customer closes at `maxTurns`; the candidate may end after `minTurns` |
| Operator message | ≤ 600 characters — `OPERATOR_MESSAGE_MAX_CHARS` | zod (`sendMessageBodySchema`) **and** the database (`assessment_messages_operator_len_chk`) |

Every timestamp is the server's (`now()` in Postgres or the Route Handler's clock). The client's countdown is a
display only.

## 4. Scoring (`lib/attestation/scoring.ts`, `lib/attestation/rubrics.ts`)

- **Part A.** Each served item is worth its difficulty (1, 2 or 3 points). An item counts only when the chosen option
  set **equals** the answer key (a multi-select item has no partial credit — "select all" must not pay) and the answer
  arrived in time. `A% = earned / possible × 100`.
- **Part B.** A per-day rubric; criterion weights sum to 100. The evaluator (S05) gives every criterion a score 0–100;
  `B% = Σ weight × score / 100`. A criterion the evaluator did not score counts 0 and is reported as missing.
- **Day.** `Day% = wA·A% + wB·B%` with the day's weights (defaults 40/60 for days 1–3, 20/80 for day 4, each pair
  sums to 100).
- **Caps** are inputs, not policy in `scoring.ts`: S05 may cap Part B (e.g. the conversation ended before `minTurns`)
  or the whole day (e.g. a manipulation attempt) by passing `cap`. The cap and its reason are stored in `flags`.
- **Final.** `Final% = mean of the four effective day scores` once all four are evaluated; before that it is
  "k / 4" (`finalScore()` returns `{ kind: "partial", evaluated: k, total: 4 }`).
- **Override.** An admin override **replaces** the day score: the effective score is `override_score ?? day_score`.
  A note is required; it is audited (`assessment_audit`, action `override`). Clearing one is
  `admin_assessment_clear_override`, also with a note (`override_clear`).
- **Bands** (configurable): green ≥ 80 **"Yaxshi"**, yellow ≥ 60 **"O'rtacha"**, red < 60 **"Past"**. Validation:
  integers, `0 < yellow < green ≤ 100`. `bandFor(percent, thresholds)`.
- **Precision.** Scores are stored as `numeric(5,2)` (`roundScore()` rounds half away from zero to two decimals before
  a write). Rounding to what a person reads happens only at display.

Rubrics — stable criterion ids, weights, a label under `pages.admin.assessments.rubric.day<N>.<id>` in both message
files, and a one-line "what good looks like" for the evaluator:

| Day | Criteria (weight) |
| --- | --- |
| 1 | greeting & introduction 15 · company facts 25 · product lines 25 · needs discovery 15 · next step 10 · courtesy 10 |
| 2 | technical accuracy 35 · technical needs discovery (object type, pressure, temperature, diameter) 20 · fact-based competitor comparison 15 · clarity 15 · next step 15 |
| 3 | needs & segment discovery 25 · correct CRM next step / task 20 · accuracy on terms and packages 25 · objection handling 15 · communication 15 |
| 4 | opening & rapport 10 · needs discovery 15 · value presentation 15 · two objections 25 · factual accuracy 15 · close / next step 15 · standards adherence 5 |

The rubric is **confidential** (hard): knowing it is how a candidate would game the evaluator. `rubrics.ts` and
`scoring.ts` import `server-only`, so no client bundle — operator or admin — can contain them; the admin settings page
renders the rubric on the server.

## 5. Pace (`lib/attestation/schedule.ts`)

- **Day 1** is available on the first visit.
- **Day N > 1** is available when day N−1 has been **submitted** (any of `submitted`, `evaluating`, `evaluated`,
  `eval_failed`) **and** today in Asia/Tashkent is later than the Tashkent date of that submission. Uzbekistan keeps
  UTC+5 all year (no DST), so a Tashkent date is the UTC instant + 5 h.
- **Unlock** (`admin_assessment_unlock(email, day)`, days 2–4): waives the waiting day only. An unlocked day still
  needs the previous day submitted — the order of the programme is never skipped — but then opens at once. Pre-unlocking
  days 2–4 lets a person do all four in one sitting, in order.
- **Reset a day** (`admin_assessment_reset(attempt)`): the attempt becomes `archived` (its data is kept) and the day
  can be taken again; the next attempt's `attempt_no` is one higher.
- **Reset a person** (`admin_assessment_reset_person(email)`): every open attempt archived, every unlock removed —
  the person starts from day 1 under the normal pace.
- **At most one non-archived attempt per (person, day)** — a partial unique index, so no race can create a second.

What the schedule answers per day: `open`, `locked_after` (day N−1 not submitted), `locked_until` (the date it
opens), or `attempt` (an open attempt with its real status — for the admin; the candidate sees less, §7).

## 6. Attempt lifecycle

```
                       start (day available)
                               │
                               ▼
        ┌──────────── in_progress / part_a ────────────┐
        │   items served one at a time; each answer    │
        │   or expiry moves on; no going back          │
        │                     │ all items answered     │
        │                     │ or expired             │
        │                     ▼                        │
        │            in_progress / part_b              │   admin reset
        │   AI customer conversation; ends at maxTurns,│──────────────────┐
        │   by the candidate after minTurns, or at the │                  │
        │   session limit                              │                  │
        └─────────────────────┬────────────────────────┘                  │
                              │ submit (server)                           │
                              ▼                                           │
                          submitted ──────────────────────────────────────┤
                              │ evaluator starts (S05)                    │
                              ▼                                           │
                          evaluating ─────────────────────────────────────┤
                         │          │                                     │
                   success│          │error                               │
                         ▼          ▼                                     │
                   evaluated   eval_failed ── admin retry ──► evaluating  │
                         │          │                                     │
                         └──────────┴──────── admin reset ────────────────┤
                                                                          ▼
                                                                      archived
```

- `phase` is `part_a` then `part_b`; Part B starts only after Part A is finished, and never goes back.
- `submitted_at` is required for every status after `in_progress` except `archived` (a CHECK).
- `evaluated` requires a `day_score` (a CHECK). `eval_failed` is retryable by the admin (S05 action, S07 button).
- `archived` is final. The admin override applies to `submitted`, `evaluating`, `evaluated` and `eval_failed`.

## 7. Visibility (hard)

An operator or a sales manager may learn **only per-day status**:

| Candidate sees | For |
| --- | --- |
| `locked` + `opensOn` (a Tashkent date) | day N−1 submitted, waiting for the next day |
| `locked` + `afterDay` | day N−1 not submitted yet |
| `available` | no open attempt, may start |
| `in_progress` | an open attempt |
| `submitted` | `submitted`, `evaluating`, `evaluated` **and** `eval_failed` all read as `submitted` |

Never a score, percentage, band, colour, rubric, evaluator text, correct answer, item explanation, pass/fail or
evaluation state — not in UI, API responses, client bundles, telemetry, toasts or page titles. The admin sees
everything.

How that is held:

1. **The database.** No policy an operator or a sales manager passes exists on any assessment table: every table has
   RLS, a **restrictive** `assessment_*_admin_only` policy for `authenticated` (so no future permissive policy can open
   a row to a non-admin without dropping it), and admin-only permissive policies. `authenticated` holds no write
   privilege on attempts, messages, unlocks or the audit at all. Grants are per Postgres role and `authenticated` is
   shared by all three app roles, so "no grant for operators" is realised as "no row passes for them".
2. **One producer.** Operator responses are built only by `lib/attestation/operator-view.ts`. It constructs every
   object key by key (never a spread of a row) from inputs that carry no score, and a unit test serialises it for every
   attempt state and compares the key set with an allow-list.
3. **Narrow reads.** The operator repository selects only `id, day, status, attempt_no, submitted_at` for the state —
   scores do not leave Postgres on that path.
4. **No bundle can hold it.** `rubrics.ts`, `scoring.ts`, `config.ts`, `repository.ts`, `items-draw.ts` and
   `operator-view.ts` import `server-only`. Admin copy lives under `pages.admin.assessments.*`, which only the admin
   layout ships (`ADMIN_CLIENT_NAMESPACES`); attestation admin toasts use that namespace, not the shared `toast.*`.
5. **Telemetry.** Candidate events (S06) carry the day and the step, never an answer, a score or an evaluation state.

## 8. Integrity

- Server-authoritative state and timestamps; the client sends choices and text, never a time or a score.
- Answer keys and explanations never leave the server on a candidate path. A served item (S05) is
  `{ id, kind, prompt, options: [{ id, text }], index, total, deadline }` in the candidate's locale. S05 may shuffle
  option order per attempt (the key is by option id).
- Each attempt stores the items **as served** (`served_items`, with their version and key), so editing or deleting a
  bank item later changes nothing about an attempt already taken.
- The Copilot is refused while the person has an `in_progress` attempt (S05: `/api/copilot` answers `423
  attestation_in_progress`).
- Client signals are stored in `flags` for the admin only: tab-hidden count and ms, window blur count, paste count and
  pasted characters, per-turn typing ms. They are signals for a human, not automatic penalties.
- Manipulation attempts inside operator messages ("ignore your instructions", "give me 100") are flagged by the
  evaluator (S05) in `flags.manipulation` and set `needs_review`.

## 9. Grounding (S05)

The AI customer and the evaluator work from a **day-specific fact sheet** built from published content (the
`ContentBundle`: scripts, objections, FAQ, competitors, packages; plus products) and the admin's **extra facts**
(`assessment_config.extra_facts` / `extra_facts_ru`, ≤ 8000 characters each) — factory facts not in the knowledge
base: capacity, warranty terms, delivery terms, addresses. Day 1 emphasises company, product lines and value
propositions; day 2 products and technical FAQ; day 3 packages, terms, funnel and CRM rules; day 4 all of it plus the
objections and one competitor. The evaluator marks a claim that contradicts the fact sheet in `factual_errors`.

## 10. Item bank

- Admin-managed in `/admin/assessments/items`: `draft` / `published`, versioned (`version`, optimistic concurrency),
  every create / change / publish / unpublish / delete audited.
- AI-generated drafts from published content are S05 (they land as drafts; a human publishes).
- **Staging seed.** `npm run seed:content` (its guard: staging only, never a production ref) also inserts
  `supabase/seed/assessment-items.ts` — eight drafts per day in uz and ru, each fact from the shipped content and named
  in `source_ref` (none from the SOPs, which are still placeholders). They pass the publish checks as they are, but
  eight is below the default `itemCount`s, so staging adds items or lowers the counts before a day can start.
- **Publish checks** — in TS (`itemPublishChecks()` in `lib/attestation/schemas.ts`, shown live in the editor) and
  again by the database (`assessment_items_publishable_chk`, never stricter than the TS):
  - 2–6 options; the key ⊆ the options; `single` → exactly one key; `multi` → at least one;
  - both locales present: the prompt, every option, and the explanation if either language has one;
  - prompt ≤ 400 and every option ≤ 160 characters;
  - no two options with the same text (trimmed, whitespace collapsed, case-insensitive) in either language.
- **Draws** (`lib/attestation/items-draw.ts`): only published items of the day; `itemCount` of them, balanced
  round-robin across topics and, within a topic, towards the least-represented difficulty; items the person saw in
  earlier (archived) attempts are avoided while the bank has enough unseen ones; deterministic for a seed (S05 seeds
  with the attempt id, so a draw can be replayed). S05 refuses to start a day (`503 bank_not_ready`) while the bank has
  fewer published items than `itemCount`; the item bank page shows that readiness per day.

## 11. Retention and removal

- `public.run_assessment_retention()` deletes attempts whose `started_at` is older than `retention_days` (default 365,
  30–3650) — their messages cascade — and unlocks older than that. `/api/cron/content-scan` calls it after
  `run_retention()` (`lib/agents/retention.ts`) — each of the two runs even when the other failed, and either failing
  answers 500 (`retention_failed` / `assessment_retention_failed`); where pg_cron is enabled 0023 schedules it daily at
  21:35 UTC and the app's call returns `skipped`.
- A person removal **with** history purge (`admin_purge_person_history`, recreated by 0023) deletes their attempts
  (messages cascade) and unlocks at once and returns the counts. Without the purge they stay, like telemetry, until
  retention.
- `assessment_audit` is never purged and has no retention, like `access_audit`: it is the record of what the admin
  did. It holds scores only for overrides (before / after, the note).

## 12. Data model (0023)

Every table has RLS, admin-only policies (§7), explicit grants, and `anon` has nothing. Emails are stored
`lower(btrim())` and checked so. JSON inside the columns uses snake_case keys, as proposed.

### `assessment_config` — the singleton (`id = 1`)

| Column | Type | Notes |
| --- | --- | --- |
| `id` | smallint PK | `check (id = 1)`; the row is inserted by 0023 and never deleted |
| `weights` | jsonb | `{"1": {"partA": 40, "partB": 60}, …, "4": {"partA": 20, "partB": 80}}` — integers, each pair sums to 100 |
| `thresholds` | jsonb | `{"green": 80, "yellow": 60}` — integers, `0 < yellow < green ≤ 100` |
| `day_settings` | jsonb | per day `{itemCount 1–30, itemSeconds 15–300, minTurns 2–30, maxTurns minTurns–40, partBMinutes 5–60}` |
| `extra_facts`, `extra_facts_ru` | text | ≤ 8000 characters each |
| `retention_days` | integer | 30–3650, default 365 |
| `version`, `updated_at`, `updated_by` | | version bumped by trigger; `updated_by` stamped from the JWT |

Every JSON rule is a CHECK (`private.assessment_*_valid()`), so a direct PostgREST write cannot store a config the app
would fail to parse.

### `assessment_items`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | text PK | slug `^[a-z0-9-]{1,80}$` |
| `day` | smallint | 1–4 |
| `topic` | text | slug `^[a-z0-9-]{1,40}$` |
| `kind` | text | `single` \| `multi` |
| `difficulty` | smallint | 1–3 (the item's points) |
| `prompt`, `prompt_ru` | text | ≤ 1000 in a draft, ≤ 400 to publish; `prompt_ru` nullable in a draft |
| `options` | jsonb | `[{"id", "text", "text_ru"}]`, 0–6 in a draft (the editor always sends 2–6), 2–6 to publish; ids `^[a-z0-9]{1,8}$`, unique |
| `answer_key` | **text[]** | option ids, unique, ⊆ the options' ids at every save |
| `explanation`, `explanation_ru` | text | ≤ 2000, optional (both or neither to publish) |
| `source_ref` | text | `<kind>:<id>` — `script`, `objection`, `faq`, `competitor`, `package`, `product`, `sop`, `onboarding` |
| `status` | text | `draft` \| `published`; a published row must pass `private.assessment_item_publishable()` |
| `version`, `created_at`, `updated_at`, `updated_by` | | |

### `assessment_attempts`

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid PK | `gen_random_uuid()`; also the draw seed |
| `user_email` | text | the candidate, from the verified session only |
| `day`, `attempt_no` | smallint | `unique (user_email, day, attempt_no)` |
| `status`, `phase` | text | §6 |
| `started_at`, `part_a_started_at`, `part_a_finished_at`, `part_b_started_at`, `submitted_at` | timestamptz | server clock |
| `item_ids` | text[] | presentation order |
| `served_items` | jsonb | **added**: the items as served — `[{id, version, topic, kind, difficulty, prompt, prompt_ru, options, answer_key, explanation, explanation_ru}]` |
| `answers` | jsonb | `{"<item id>": {"chosen": [...], "served_at", "answered_at"}}` |
| `persona` | jsonb | the Part B customer (S05) |
| `part_a_score`, `part_b_score`, `day_score`, `override_score` | numeric(5,2) | 0–100 |
| `rubric` | jsonb | `[{"criterion", "score", "evidence"}]` |
| `factual_errors` | jsonb | `[{"quote", "correction", "severity"}]` |
| `evaluator_runs` | jsonb | `[{"at", "model", "ok", "error", "latency_ms"}]` |
| `needs_review` | boolean | set by the evaluator |
| `flags` | jsonb | client signals, caps, manipulation (§8) |
| `override_note`, `overridden_by`, `overridden_at` | | all four override columns set together or all null |
| `model`, `eval_model` | text | the customer and evaluator models |
| `version`, `updated_at`, `updated_by` | | |

A partial unique index `(user_email, day) where status <> 'archived'` holds "at most one open attempt per day".

### `assessment_messages`

`attempt_id` (FK, `on delete cascade`), `seq` 1–200, `role` `customer` \| `operator`, `content` 1–2000 characters
(an operator message ≤ 600), `created_at`, `latency_ms` (the customer reply's generation time). PK `(attempt_id,
seq)`. **Append-only**: an UPDATE is refused by trigger; rows go only with their attempt.

### `assessment_unlocks`

`user_email`, `day` (2–4), `unlocked_by`, `unlocked_at`; PK `(user_email, day)`.

### `assessment_audit`

`id` (identity), `created_at`, `actor`, `action` (`override`, `override_clear`, `reset`, `reset_person`, `unlock`,
`config_update`, `item_create`, `item_update`, `item_publish`, `item_unpublish`, `item_delete`), `target_email`,
`attempt_id` (no FK — the attempt may be purged, the record stays), `item_id`, `day`, `details` jsonb. **Append-only**:
UPDATE, DELETE and TRUNCATE are refused by trigger, even for the owner (drop the trigger first to change history — a
visible, deliberate act), exactly like `access_audit`.

### Deviations from the proposed model, and why

1. **`answer_key` is `text[]`, not jsonb** — it is a list of option ids; `text[]` makes "⊆ the options" and "unique"
   plain CHECKs and matches the project's other id lists (`content_objections.script_ids`, `copilot_logs.hit_ids`).
2. **`served_items` on the attempt** — a snapshot of each drawn item (with its version and key). Without it, an edit
   or delete in the bank would silently change what a past attempt is scored and reviewed against.
3. **`updated_by` on attempts, `created_at` on items** — CLAUDE.md §7 asks for `updated_at`/`updated_by` on every new
   table. `assessment_messages` and `assessment_audit` are append-only and carry `created_at` (+ `actor`) instead, as
   `access_audit` does (0017).
4. **Override clearing** — `admin_assessment_clear_override(attempt, note, version)` (a note still required, audited
   `override_clear`), so a mistaken override is not permanent. A function of its own rather than a nullable score on
   the override: `p_score` stays required there, which is also what the generated types say.
5. **`admin_assessment_reset(p_attempt, p_version default null)`** — the optional version guards a reset against an
   attempt that changed since the admin looked (the S07 button sends it); the one-argument call still works.
6. **`admin_assessment_unlock` returns boolean** (a new unlock recorded, or it already existed) and **refuses anyone
   who is not an allow-listed operator or sales manager** (`WT404`).
7. **The five admin functions are `SECURITY DEFINER`, not INVOKER** — see §13. Items and config use direct RLS writes.
8. **Restrictive policies** — an extra `as restrictive` admin-only policy on every table (§7).
9. **`source_ref` is typed** (`faq:product-1`) — content ids are unique per table, not across tables.
10. **A dedicated retention function** instead of editing 0016's `run_retention()`: changing its result columns means
    dropping it, and a later re-run of 0016 (which the docs call safe) would silently remove attestation retention.

## 13. Security model

- **Reads (admin).** The admin's own RLS-scoped session reads every table (`adminAttestationRepo()`).
- **Writes (admin), items and config — direct RLS writes with version guards.** The CMS pattern (CLAUDE.md §7): the
  admin's session updates `assessment_items` / `assessment_config` with `.eq("version", v)`; a trigger bumps `version`;
  column grants exclude `id` (on update), `version`, `created_at`, `updated_*`; CHECK constraints hold every shape and
  publish rule; an `AFTER` trigger (`SECURITY DEFINER`) writes the audit row — so the SQL editor, the seed (service
  role) and a direct PostgREST call are audited exactly like the UI. Chosen over functions because it is the pattern
  every other admin editor already follows and the audit cannot be skipped by any path.
- **Writes (admin), attempts and unlocks — five functions, `SECURITY DEFINER`.** `admin_assessment_override`,
  `admin_assessment_clear_override`, `admin_assessment_reset`, `admin_assessment_reset_person`,
  `admin_assessment_unlock`. The proposal said INVOKER; that
  would need the admin session to hold UPDATE on attempts, INSERT on unlocks and INSERT on `assessment_audit` — so any
  admin session could rewrite a score or forge an audit row straight over PostgREST, around every check the function
  makes. As DEFINER the functions are the only way in and `authenticated` holds no write privilege on those tables
  (0022's reasoning for `admin_purge_person_history`). Each one: first statement `private.is_admin()` → `WT403`; then
  the allow-list guard's advisory lock and the caller's own row must be an active admin → `WT403` (a stale admin
  token); arguments → `WT400`; the row → `WT404`; state or version → `WT409`; then the write and one audit row. They
  return no score. `EXECUTE` is `authenticated`'s alone; `set search_path = ''`; the migration refuses to finish if
  the functions' owner would be narrowed by RLS.
- **Candidate paths — Route Handlers + the service role, scoped to the session email.** Operators and sales managers
  have no policy on any assessment table, so their own attempt is reached only through `app/api/attestation/**` (S05):
  verify the session (`getServerSession()`), refuse an admin, then `operatorAttestationRepo(sessionEmail(session))` —
  the service-role client with **every query filtered by that email** — and answer only what `operator-view.ts`
  builds. The same justified pattern as `copilot_logs` in `/api/copilot`: the row's identity comes from the verified
  session, never from a request body (`SessionEmail` is a branded type only `sessionEmail()` can make). Giving the
  candidate a SELECT policy on their own attempt would expose every column of it — scores, rubric, key snapshot —
  to their browser over PostgREST.
- **Service-role grants are narrowed too** (defence in depth for S05): SELECT on everything it reads; INSERT on
  attempts only for the columns a start writes; UPDATE on attempts only for progress / evaluation columns — never
  `user_email`, `day`, `attempt_no`, the override columns or `version`; INSERT on messages; SELECT, INSERT, UPDATE on
  items (the staging seed); no DELETE anywhere, no access to the audit.
- **Errors.** SQLSTATE → `AdminErrorCode` (`lib/admin/errors.ts` `assessmentDbCode`): `WT403`/`42501` →
  `unauthorized`, `WT400`/`23514` → `validation`, `WT404` → `not_found`, `WT409` → `version_conflict`, `23505` →
  `id_taken`, else `unknown`. The message stays in the server log.
- The threat model (a candidate reading a score, answer-key leakage, cross-person access) is
  [SECURITY.md §7](SECURITY.md#7-attestation-threat-model).

## 14. `lib/attestation/`

| Module | Kind | What it is |
| --- | --- | --- |
| `types.ts` | pure, client-safe | days, statuses, phases, bands, item and config shapes, the discriminated unions |
| `schemas.ts` | pure, client-safe | zod: config, items (write + `itemPublishChecks`), admin inputs, every S05 API body, the stored JSON shapes |
| `rubrics.ts` | pure, **server-only** | the four rubrics |
| `scoring.ts` | pure, **server-only** | Part A, Part B, day, final, band, rounding |
| `schedule.ts` | pure | per-day availability from attempts + unlocks + Tashkent today |
| `items-draw.ts` | pure, **server-only** | the seeded, balanced draw |
| `config.ts` | **server-only** | typed defaults, row parsing, `getAssessmentConfig()`, `PART_A_GRACE_SECONDS` |
| `repository.ts` | **server-only** | `operatorAttestationRepo(email)` (service role, email-scoped) and `adminAttestationRepo()` (RLS session) |
| `operator-view.ts` | pure, **server-only** | the only producer of candidate responses |
| `item-bank.ts` | pure, client-safe | the item bank page: list rows without key or explanation, the URL filter state and search, the editor's form values |

## 15. API contract (S05 implements)

All under `app/api/attestation/`, Node runtime, `dynamic = "force-dynamic"`, `Cache-Control: no-store`, the order of
CLAUDE.md §7 (session → role → zod → size cap → typed `{ error }`), rate limited per person (`rate_limit_hit`).
Bodies are the schemas in `lib/attestation/schemas.ts`. `attemptId` is always re-checked against the session email.

| Route | Body | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/attestation/state` | — | `200 OperatorAttestationState` | 401 `unauthorized`, 403 `not_a_candidate` |
| `POST /api/attestation/attempts` | `startAttemptBodySchema` `{ day }` | `201 { attemptId, day, phase: "part_a", item: ServedItem }` | 409 `day_locked` / `attempt_exists`, 503 `bank_not_ready` |
| `GET /api/attestation/attempts/[id]` | — | `200 { attemptId, day, phase, item? , transcript?, deadline }` (resume) | 404 `not_found`, 409 `not_in_progress` |
| `POST /api/attestation/attempts/[id]/answers` | `answerItemBodySchema` `{ itemId, chosen }` | `200 { item: ServedItem \| null, phase }` — never right/wrong | 409 `wrong_item` / `wrong_phase`, 410 `time_up` |
| `POST /api/attestation/attempts/[id]/part-b` | `beginPartBBodySchema` `{}` | `200 { phase: "part_b", message: CustomerMessage, deadline }` | 409 `wrong_phase` |
| `POST /api/attestation/attempts/[id]/messages` | `sendMessageBodySchema` `{ content, typingMs, clientSeq }` | `200 { message: CustomerMessage, ended }` (may stream) | 409 `wrong_phase` / `ended`, 410 `time_up`, 413 too long |
| `POST /api/attestation/attempts/[id]/signals` | `signalsBodySchema` (counters since the last report) | `204` | — |
| `POST /api/attestation/attempts/[id]/submit` | `submitAttemptBodySchema` `{}` | `202 { status: "submitted" }` | 409 `wrong_phase` / `too_few_turns` |

`ServedItem` = `{ id, kind, prompt, options: [{ id, text }], index, total, deadline }`; `CustomerMessage` =
`{ seq, text }`. `operator-view.ts` gains one producer per shape, each with an allow-list test like
`OperatorAttestationState`'s. Evaluation runs after submit, server-side (service role); nothing about it is ever sent
to the candidate. The admin retries `eval_failed` through a Server Action (S05) that re-runs the evaluator.

## 16. Operator UI (S06) — reserved

`app/[locale]/(app)/attestation/` (the day list and the runner), `components/attestation/`, and
`app/api/attestation/` (S05). A work page (CLAUDE.md §14): response motion only, no scroll scene. The day list shows
the four statuses of §7 and nothing else; the Part A runner shows one item with a countdown; Part B is a chat.
Candidate copy lives under `pages.attestation.*`, which may never contain a score, band or rubric word.

## 17. Admin screens

Built in S04:

- **Nav:** "Attestatsiya" / "Аттестация" in the Monitoring group after "Xodimlar" (`lib/admin/nav.ts`).
- **Sub-nav** on every page: Natijalar · Savollar banki · Sozlamalar.
- **`/admin/assessments` — Natijalar.** The empty state "Hali topshirilgan attestatsiya yo'q" linking to the item
  bank while nobody has submitted; once someone has, a table of submitted attempts (person, day, attempt, status,
  submitted, effective score with its band). S07 replaces it.
- **`/admin/assessments/items` — Savollar banki.** Readiness per day (published / needed); filters (day, topic,
  status, difficulty) and search, all in the URL (`history.replaceState`); publish / unpublish / delete per row.
- **`/admin/assessments/items/[id]` (`new`)** — the editor: day, topic (suggestions per day), kind, difficulty, uz and
  ru prompt, 2–6 options with the correct one(s), explanation, source, and the status it is saved with — saving it
  as `published` runs the publish checks (shown live beside the form) in the action and again in the database;
  version conflicts answer `version_conflict`. `new` is never an item id (`NEW_ITEM_ID`). Built from the CMS primitives, **not** the CMS registry:
  a registry entry would put the table in the daily stale scan, admin notifications, content health, the trash, the
  versions page and the publish gate's content bundle — and every snapshot would copy the answer key into
  `content_versions`. The table is also never read by an operator loader, search, the Copilot retriever or
  `/api/content-refs`.
- **`/admin/assessments/settings` — Sozlamalar.** Part A / Part B weights per day, thresholds with the three bands,
  per-day item counts and limits (with the bank's readiness), extra facts uz / ru with a live counter, retention days,
  and the rubrics read-only.

S07 builds: the results matrix (person × day, effective score, band colour, status, Final% or k/4), filters, the
person drill-down (Part A items chosen vs key with explanations, the transcript, the rubric breakdown, factual errors,
flags, evaluator runs), override (note required), reset a day or a person, unlock, the evaluator retry, and the audit
log. Every write goes through the five functions and `lib/admin/actions/assessments.ts` (already there).
