# Performance notes

What operator pages ship to the browser, how it is measured, and the budgets. Numbers come from a
production build only (`npm run build`, served with `npm run start`), never from `npm run dev`.

## How to measure

```
npm run build      # route table: Page JS / First Load JS (gzip)
npm run analyze    # bundle analyzer; on Windows: set ANALYZE=true&& next build
                   # reports land in .next/analyze/{client,nodejs,edge}.html
```

**Reading the route table.** `next build` builds each row from the page entry plus the shared chunks. It does
**not** include the chunks that only the `(app)` layout pulls in (AppShell, SessionProvider and what they import).
A second, measured figure is therefore recorded below: the gzip size of every `<script src>` in the prerendered
HTML of a route (`.next/server/app/uz/**/*.html`, `polyfills` excluded), plus the HTML size itself. That is what a
browser really downloads before the page is interactive. The budgets in CLAUDE.md §4 use the table figure; the
measured figure is tracked so the gap stays visible.

## Baseline 2026-09-21

Commit `88d4272`, Next.js 14.2.35. Shared by all routes: **89.2 kB**.

| Route | Area | Page JS | First Load JS |
|---|---|---:|---:|
| `/` | operator | 7.81 kB | 237 kB |
| `/admin` | manager | 186 B | 100 kB |
| `/admin/changelog` | manager | 160 B | 140 kB |
| `/admin/changelog/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/competitors` | manager | 160 B | 140 kB |
| `/admin/competitors/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/contacts` | manager | 160 B | 140 kB |
| `/admin/contacts/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/faq` | manager | 160 B | 140 kB |
| `/admin/faq/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/notifications` | manager | 6.13 kB | 127 kB |
| `/admin/objections` | manager | 160 B | 140 kB |
| `/admin/objections/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/packages` | manager | 160 B | 140 kB |
| `/admin/packages/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/packages/groups` | manager | 159 B | 140 kB |
| `/admin/packages/groups/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/products` | manager | 160 B | 140 kB |
| `/admin/products/[id]` | manager | 2.05 kB | 149 kB |
| `/admin/scripts` | manager | 160 B | 140 kB |
| `/admin/scripts/[id]` | manager | 9.03 kB | 172 kB |
| `/admin/sops` | manager | 160 B | 140 kB |
| `/admin/sops/[id]` | manager | 4.91 kB | 165 kB |
| `/admin/versions/[table]/[id]` | manager | 5.14 kB | 126 kB |
| `/changelog` | operator | 5.86 kB | 212 kB |
| `/company` | operator | 155 B | 134 kB |
| `/company/about` | operator | 596 B | 163 kB |
| `/company/contacts` | operator | 160 B | 139 kB |
| `/company/factory-tour` | operator | 1.29 kB | 139 kB |
| `/company/internal-rules` | operator | 1.29 kB | 139 kB |
| `/company/mission-values` | operator | 234 B | 163 kB |
| `/company/onboarding` | operator | 10.6 kB | 248 kB |
| `/dashboard` | manager | 4.19 kB | 117 kB |
| `/dashboard/content` | manager | 5.89 kB | 137 kB |
| `/dashboard/quality` | manager | 4.19 kB | 117 kB |
| `/faq` | operator | 2.96 kB | 139 kB |
| `/login` | public | 2.46 kB | 200 kB |
| `/logistics` | operator | 155 B | 134 kB |
| `/logistics/returns-policy` | operator | 924 B | 125 kB |
| `/logistics/sample-shipping` | operator | 924 B | 125 kB |
| `/offline` | public | 3.67 kB | 109 kB |
| `/products` | operator | 10.3 kB | 231 kB |
| `/products/comparisons` | operator | 4.02 kB | 128 kB |
| `/products/roadmap` | operator | 924 B | 125 kB |
| `/products/technical-docs` | operator | 3.67 kB | 143 kB |
| `/sales-process` | operator | 156 B | 134 kB |
| `/sales-process/battle-cards` | operator | 160 B | 139 kB |
| `/sales-process/battle-cards/[slug]` | operator | 5.47 kB | 223 kB |
| `/sales-process/objections` | operator | 160 B | 139 kB |
| `/sales-process/scripts` | operator | 15.2 kB | 248 kB |
| `/sales-process/scripts/[slug]` | operator | 7.61 kB | 142 kB |
| `/standards` | operator | 156 B | 134 kB |
| `/standards/career-path` | operator | 924 B | 125 kB |
| `/standards/communication-standards` | operator | 924 B | 125 kB |
| `/standards/kpi-system` | operator | 486 B | 140 kB |
| `/standards/motivation-bonus` | operator | 486 B | 140 kB |
| `/tools` | operator | 156 B | 134 kB |
| `/tools/amocrm` | operator | 154 B | 134 kB |
| `/tools/amocrm/[slug]` | operator | 924 B | 125 kB |
| `/tools/calculator` | operator | 5.71 kB | 126 kB |
| `/tools/communication-standards` | operator | 924 B | 125 kB |
| `/tools/google-sheets` | operator | 924 B | 125 kB |
| `/tools/repeat-sales-funnel` | operator | 924 B | 125 kB |
| `/tools/sales-funnel` | operator | 924 B | 125 kB |

### Five largest client modules (bundle analyzer, parsed size)

| # | Module | Parsed | Gzip | Where it loads |
|---|---|---:|---:|---|
| 1 | `react-dom` (Next's compiled copy) | 168.7 kB | 52.3 kB | every route (shared chunk) |
| 2 | `react-dom` in `framework-*.js` | 125.7 kB | 40.1 kB | Pages Router framework chunk, referenced by no App Router page |
| 3 | `@sentry-internal/replay` | 119.7 kB | 37.1 kB | separate async chunk, referenced by no page HTML |
| 4 | `@supabase/auth-js` `GoTrueClient` | 67.1 kB | 14.0 kB | **every operator page** (see Open items) |
| 5 | `zod` v3 | 49.1 kB | 10.8 kB | **every operator page** (via `lib/env` and user-state schemas) |

Next in line: `public/sw.js` 53.3 kB (service worker, not page JS), `react-hook-form` 37.9 kB (admin only),
`@supabase/storage-js` + `postgrest-js` 29.3 + 28.1 kB (same chunk as `createBrowserClient`, 53 kB gzip),
`fuse.js` 25.5 kB. `framer-motion` totals 160 kB parsed across chunks, of which the `domMax` feature bundle is async.

### Measured payload (scripts in the HTML, gzip; HTML uncompressed)

49 prerendered `uz` pages excluding `/offline`: scripts **248 / 252 / 281 kB** (min / median / max),
HTML **90 / 110 / 160 kB**. Every operator page, including the ones the table shows at 125-139 kB, loads the
Supabase browser client chunks (`5283`, `44530001`, `1351`), because the `(app)` layout's `SessionProvider`
imports it.

## Changes (S16)

**Client messages scoped per area.** `app/[locale]/layout.tsx` used to pass the whole `messages` object to
`NextIntlClientProvider`, so every page serialized every namespace. It now passes only what client components read
(`ROOT_CLIENT_NAMESPACES` in `lib/i18n/client-messages.ts`; the long-form `pages.*` copy that only Server
Components render stays out: 17.5 of 47.4 kB of `uz.json` remain). `(admin)/admin/layout.tsx` and
`dashboard/layout.tsx` nest a second provider with the root list plus their own (`admin` + `pages.admin`;
`dashboard` + `admin.gate`). A nested `IntlProvider` replaces its parent's messages instead of merging, so the
root list is repeated there. `tests/unit/i18n/client-messages.test.ts` walks the imports from every
`"use client"` file and fails when a `useTranslations` namespace is missing from the list for that area (it
caught `admin.gate` for the dashboard's `QuickActionButton` while this was written).

**Lazy Call Mode.** `ScriptsWorkspace` loaded `CallModeOverlay` statically, which dragged `lib/search` and
`fuse.js` into the scripts route. It is now `next/dynamic` (`ssr: false`) and warmed on idle, like
`CommandPalette` in `AppShell`.

**fuse.js off the home page.** `lib/search/refs.ts` imported `findStageFor` from `lib/search` (which imports
`fuse.js`). The 7-line function moved to `lib/search/find-stage.ts`; `lib/search/index.ts` imports it from there.

**Images.** The first certificate card image is `priority` (LCP candidate of `/products/technical-docs`).

### What was checked and left alone

| Item | Finding |
|---|---|
| framer-motion features | `MotionProvider` uses `LazyMotion strict` with a dynamic `import("@/lib/motion/features")`; no `motion.*` anywhere, all `m.*`. The `domMax` chunk (~50 kB raw) is referenced by 0 HTML files. |
| `components/story/*` | (S16; the scenes were replaced in R3/S05–S07 — see those sections) Scene code (`PipelineStory`, `PipelineChapter`, `geometry`) sits in one chunk referenced only by `/company/about` and `/company/mission-values`. `/company/onboarding` imports only `fittings.tsx` (1.5 kB of SVG glyphs). |
| `lucide-react` | Only named per-icon imports (several multi-line); no namespace import, no `icons` map. |
| `CommandPalette`, `CopilotPanel`, `ShortcutsHelp` | already `next/dynamic`, `ssr: false`. |
| Certificate lightbox | Static import from a Server Component page; 4 kB parsed on a route at 143 kB. `ssr: false` is not allowed in a Server Component, so a client wrapper would be needed for ~1.5 kB gzip. Left. |
| `MiniCalculatorButton` | 3.9 kB parsed in the `(app)` layout chunk, inside `TopBar` (a structural file this task does not name). Left. |
| `BatchCalculator`, admin editors | Primary content of their routes, not below the fold: lazy loading would only add a waterfall. Admin routes are at 100-172 kB. |
| `next/image` | Every `<Image>` (`ProductsCatalog` x2, `CertificateGrid`, `CertificateGallery`) has `sizes`. `priority` was on none; now only on the first certificate. Product grid images are not priority. |

## After 2026-09-21

Only rows whose First Load JS changed (every other route is identical to the baseline table):

| Route | Baseline | After |
|---|---:|---:|
| `/` | 237 kB | 226 kB |
| `/company/factory-tour` | 139 kB | 138 kB |
| `/company/internal-rules` | 139 kB | 138 kB |
| `/sales-process/scripts` | 248 kB | 235 kB |

Measured payload, same 49 pages: scripts **249 / 252 / 281 kB**, HTML **58 / 78 / 128 kB**. Every page's HTML is
**~32 kB smaller (uncompressed)** from message scoping; home goes 269 to 259 kB and scripts 280 to 265 kB of script
gzip from the fuse and Call Mode changes. Wire size depends on compression and was not measured.

## After 2026-09-22 (S05, owner namespacing and sign-out purge)

`components/providers/SessionProvider.tsx` now tells the client-side stores whose data they hold, so the `(app)`,
`(admin)` and `dashboard` layouts reach `lib/user-state/store.ts` (and through it `keys/merge/queue/prune/owner`)
from the layout chunk rather than only from the pages that call `useUserState`. Cost: **+1 to +3 kB First Load JS
on every operator route**, `+2 kB` on `/admin/scripts/[id]`.

| Route | Before | After |
|---|---:|---:|
| `/` | 226 kB | 229 kB |
| `/products` | 231 kB | 234 kB |
| `/sales-process/scripts` | 235 kB | 238 kB |
| `/sales-process/battle-cards/[slug]` | 223 kB | 225 kB |
| `/changelog` | 212 kB | 214 kB |
| `/company/onboarding` | 248 kB | 249 kB |
| `/faq`, `/standards/kpi-system`, `/standards/motivation-bonus` | 139-140 kB | 141-142 kB |
| `/admin/scripts/[id]` | 172 kB | 174 kB |
| every other operator route | 125-143 kB | 127-144 kB |

**Why it was not deferred to a dynamic import.** The purge has to stop uploads *synchronously* on the auth event:
`supabase.auth.onAuthStateChange` fires in every tab, and the pending `user_state` queue of the account that is
leaving would otherwise be uploadable under the next account's JWT during the tick an `await import(...)` costs
(the server takes the row's identity from the JWT, never from the payload). A statically linked
`stopUserStateSends()` is what closes that window. No route crossed 180 kB that was not already over it, and the
set of over-budget routes is unchanged at the same six.

## After 2026-09-22 (S06, content registry and typed action errors)

Manager routes only — every operator route is byte-identical to the S05 figures above, because nothing
in this change is reachable from the `(app)` layout and the new `admin.errors` / `admin.validation`
namespaces are added to the admin and dashboard providers, not to `ROOT_CLIENT_NAMESPACES`.

`hooks/useActionError.ts` (the code → copy mapping every admin write now goes through) and
`lib/admin/validation.ts` are imported by DataTable, EntityForm, ScriptEditor, SopEditor, VersionsList,
NotificationsInbox and the dashboard's QuickActionButton, so they land in the shared admin chunk rather
than in each page. That is why several **page** JS figures fall while **First Load** rises by 1-2 kB:

| Route | Before | After |
|---|---:|---:|
| `/admin/<section>` (all ten list pages) | 140 kB | 141 kB |
| `/admin/<section>/[id]` (seven EntityForm editors) | 149 kB | 151 kB |
| `/admin/scripts/[id]` | 174 kB | 175 kB |
| `/admin/sops/[id]` | 165 kB | 167 kB |
| `/admin/notifications` | 127 kB | 129 kB |
| `/admin/versions/[table]/[id]` | 126 kB | 128 kB |
| `/dashboard/content` | 137 kB | 139 kB |
| `/admin`, `/dashboard`, `/dashboard/quality` | 100 / 117 / 117 kB | unchanged |

`/admin/scripts/[id]` stays the largest manager route at 175 kB, still under the 180 kB budget; no route
crossed a budget it was not already over, and the over-budget set is unchanged.

**The RSC payload, not the bundle, is the point of this slice.** `lib/admin/queries.ts` used to `select("*")`
for every list, so each list page serialized whole rows into its RSC payload for a table that renders two
columns. `listRows(table)` now selects `id,status,version,updated_at,updated_by,sort_order` plus the registry
entry's `listColumns`. `/admin/scripts` is the extreme case: its rows carried `stages` and `stages_ru`, the
full stage tree of every script, to render a name. `tests/unit/admin/registry.test.ts` fails if either column
ever reappears in a list projection. Full rows are still one call away (`listFullRows`) for the two callers
that map them through `lib/content/db` — the publish gate's bundle and the script editor's link pickers.

## After 2026-09-23 (S11, uploaded product photos, migration 0018)

Measured against a production build of the commit before S11, same machine, same env:

| Route | Before | After |
|---|---:|---:|
| `/products` | 234 kB | 234 kB |
| `/products/technical-docs` | 143 kB | 144 kB |
| `/company/onboarding` | 249 kB | 250 kB |
| `/admin/<section>/[id]` (the eight EntityForm editors) | 151 kB | 166-167 kB |
| every other route | — | unchanged |

- **`/products`.** `ProductsCatalog` now resolves every photo through `productImageSrc` in
  `lib/content/products.ts` — the module that also holds the 28-product seed array. The first build of this
  change shipped that array to the browser (+2 kB First Load, the product names visible in the page chunk);
  the array is now built inside a `/* @__PURE__ */` IIFE, so a bundle that imports only the helpers drops it.
  `grep -rl rakor-naruzhnoy-rezboy .next/static/chunks` finds nothing. `clientEnv` (for the Storage URL) was
  already on the layout path through `SessionProvider`, so it costs nothing here.
- **`/products/technical-docs`, `/company/onboarding` (+1 kB each).** No new code: the module lists of the
  two page chunks show webpack's split-chunk grouping moving shared modules between them.
- **Admin editors (+15-16 kB in the table, manager only).** The "before" figure measured pages that could not
  render: every `EntityForm` editor passed its zod form schema from the Server Component page into the Client
  Component, and React refuses to serialize a class instance ("Only plain objects … can be passed to Client
  Components"). The editors are dynamic routes, so `next build` never renders them and the failure only showed
  at request time. Each editor now has a `"use client"` wrapper (`components/admin/<X>EditorForm.tsx`) that
  imports its schema and save action, so the pages reference zod's core (chunk `1351`, 11.7 kB gzip) and
  `lib/admin/schemas.ts`. Most of the table's increase is its own blind spot (see "Reading the route table"): the
  admin layout's `SessionProvider` already loads `1351` on every admin page, so the table now counts a chunk the
  browser was downloading anyway. What is really new per editor is about 2-3 kB gzip: the shared schemas module,
  and the `next/dynamic` runtime `EntityForm` uses to load the photo picker (`components/admin/ImageUploadField.tsx`)
  only on `/admin/products/[id]`. Every admin route stays under 180 kB; `/admin/scripts/[id]` (175 kB) is still the
  largest.

The over-budget set is unchanged at the same six operator routes.

## Dashboard queries (S09, migration 0016)

**Before.** Each dashboard tab ran one `select` of raw `telemetry_events` rows for the range plus the equal-length
previous range (up to 186 days), with no order, limit or pagination, and aggregated in the page. PostgREST caps a
response at `max-rows` (1000 by default), so once the window held more than 1000 events every number on the tab was
computed on an arbitrary subset, and nothing said so. The payload grew with activity: 1000 rows of 10 columns is
roughly 300-400 kB of JSON per render, all of it discarded after aggregation.

**After.** The pages call `public.dashboard_*` functions through `supabase.rpc` (`lib/dashboard/telemetry-window.ts`),
in parallel: Faollik makes 5 calls, Sifat 4 (plus the onboarding query), Kontent 1. Each returns aggregates only, so
the payload no longer depends on how busy the range was:

| Function | Rows returned | Measured JSON |
|---|---:|---:|
| `dashboard_kpis` | 1 | ~150 B |
| `dashboard_operator_activity` | one per active operator (~30) | ~4.6 kB |
| `dashboard_hourly` | 24 | ~0.9 kB |
| `dashboard_zero_result_searches` | <= `p_limit` (100) | a few kB at most |
| `dashboard_web_vitals` | one per metric (5) | < 0.5 kB |
| `dashboard_not_helpful` | <= `p_limit` (100) | a few kB at most |
| `dashboard_most_viewed` | <= `p_limit` (10) | ~0.9 kB |

Every ranked list is capped by `p_limit` in SQL, after ranking, so no response can reach `max-rows`.

**Measured latency.** Synthetic `telemetry_events`: 372 000 rows, 2 000 events a day for 186 days across 30
operators and 15 event types, `vacuum analyze`d. Median of 3 warm calls per function, measured in PGlite 0.5.8
(Postgres 18 compiled to WebAssembly, single-threaded, run in Node). It is a pessimistic stand-in: native Postgres on
Supabase is typically several times faster, so treat these as upper bounds and re-measure on staging.

| Function | 7-day range (14 k + 14 k rows) | 93-day range (186 k + 186 k rows) |
|---|---:|---:|
| `dashboard_kpis` (both windows) | 24 ms | 272 ms |
| `dashboard_operator_activity` | 32 ms | 513 ms |
| `dashboard_hourly` | 13 ms | 138 ms |
| `dashboard_zero_result_searches` | 5 ms | 51 ms |
| `dashboard_web_vitals` | 10 ms | 104 ms |
| `dashboard_not_helpful` | 5 ms | 59 ms |
| `dashboard_most_viewed` | 8 ms | 99 ms |

The calls of a tab run in parallel, so a tab's database wait is its slowest call: `dashboard_operator_activity` on
Faollik. The plans use index-only scans on the two covering indexes 0016 adds
(`telemetry_events_ts_cover_idx`, `telemetry_events_type_ts_cover_idx`); the first-seen row of each listed group is
fetched with one primary-key probe (`LATERAL … LIMIT 1`), not a join along the primary key.

**Bundle.** The error state (`components/dashboard/DashboardWidgetError.tsx`, a `WidgetFallback` with
`router.refresh()` as retry) moves `/dashboard` and `/dashboard/quality` from 117 kB to 133 kB in the route table;
`/dashboard/content` stays at 140 kB. The +16 kB is one chunk, next-intl's client runtime (`useTranslations`,
`NextIntlClientProvider`), which `dashboard/layout.tsx` already loads on every dashboard page: the table counts a
page's own entry chunks and not its layout's, so it now lists a chunk the browser was downloading anyway. Checked in
`.next/app-build-manifest.json`: beyond the layout's chunks, each page still loads only its own page chunk and the
one shared chunk it loaded before. Manager routes are outside the 180 kB operator budget either way.

**How to measure on staging.** In the SQL editor, impersonate a manager and time the call:

```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"role":"authenticated","app_metadata":{"role":"manager"}}';
explain (analyze, buffers) select * from public.dashboard_operator_activity(now() - interval '7 days', now());
rollback;
```

`EXPLAIN` of a plpgsql function shows only the function scan; for the inner plan, paste the function's query with
literal bounds (the `with op_first as (…)` body) under the same role. In dev, the pages' `console.time` lines
(`[dashboard] Faollik render`, …) time the whole server render.

## Budgets

| Budget | Limit |
|---|---|
| Operator route First Load JS (`next build` table) | <= 180 kB |
| Client message payload | only allow-listed namespaces (`lib/i18n/client-messages.ts`), enforced by vitest |
| Modules mounted only after an interaction | `next/dynamic` when >= ~4 kB parsed or when they pull a dependency into first load |
| Dashboard data | aggregates only: no dashboard code path selects rows from `telemetry_events`; a new widget is a new SQL function with a case in `supabase/tests/dashboard-parity.sql` (people analytics: `supabase/tests/people-checks.sql`) |
| Dashboard ranked lists | capped by `p_limit` (<= 1000, PostgREST's `max-rows`); the pages send 100 / 100 / 10 |
| Dashboard function latency (staging, native Postgres) | <= 300 ms per call at the default 7-day range; <= 2 s at the 93-day maximum — far inside the `authenticated` role's statement timeout (8 s on Supabase), which would turn an overrun into the widget's error state |

### Routes over 180 kB: none after S14 (baseline: 6 of 36 operator routes)

| Route | Baseline | After S16 | After S05 | After S14 |
|---|---:|---:|---:|---:|
| `/company/onboarding` | 248 kB | 248 kB | 249 kB | 180 kB |
| `/sales-process/scripts` | 248 kB | 235 kB | 238 kB | 170 kB |
| `/products` | 231 kB | 231 kB | 234 kB | 166 kB |
| `/` | 237 kB | 226 kB | 229 kB | 160 kB |
| `/sales-process/battle-cards/[slug]` | 223 kB | 223 kB | 225 kB | 156 kB |
| `/changelog` | 212 kB | 212 kB | 214 kB | 145 kB |

`/company/onboarding` reads 180 kB in the route table, which is rounded: it meets the `<= 180 kB` limit with no
headroom, so the next client import on that page needs a look at the table first.

**Why they were over.** All six import the per-user state store (`useUserState`: pins, favourites, onboarding
progress, scripts position, changelog read receipts), and `lib/user-state/store.ts` imported `lib/supabase/client`
statically, which put the Supabase browser client (~67-80 kB gzip) into every page's first-load JS. S14 removed
that (see below).

## After 2026-09-23 (S14, lazy Supabase client)

`lib/supabase/client-lazy.ts` exports `getSupabaseClient()`: one memoized `import("@/lib/supabase/client")`, one
shared client, and a failed chunk load is not cached (the next call retries). `SessionProvider`,
`lib/user-state/store.ts` and `lib/auth/sign-out.ts` use it instead of the static import; `lib/auth/purge.ts` only
reached the client through the store. Behaviour that had to survive, and how:

- **Owner guard (S05).** Every place that used the client already re-checked `owner` after its awaits. The client
  load is one more await, so `syncFromServer`, `pruneDaily` and the `send()` loop each re-check `owner` / `stopped`
  straight after `getSupabaseClient()` and before the request goes out. Nothing queued under one account can be
  uploaded because the chunk arrived late.
- **Purge.** `stopUserStateSends()` is synchronous and unchanged; `signOutAndPurge` still purges before it asks for
  the client, and revokes the session with it afterwards.
- **Singleton.** The store's module-level client is replaced by the loader's single promise.
- **SessionProvider.** The auth subscription now starts when the chunk arrives. `active` is checked after the load
  so an unmount in between leaves no listener, and the subscription is registered before `getSession()` so an auth
  event during the first read is not missed. Until then the provider is `loading`, as it already was on first paint.

`/login` (200 kB, public) still imports the client statically through `GoogleSignInButton`: it needs it to start
OAuth and is not an operator route.

Also in S14 (no bundle effect): the palette input is now a `combobox` (`CommandPalette`), the TopBar search is an
icon-only button below `sm`, the nav badge text and lock icon colours changed. See `docs/AUDIT.md` #9-#14.

## Measured at the Audit-2 release audit (2026-09-23, commit `4d832e3`)

Operator routes are exactly the S14 figures above: every one ≤ 180 kB, `/company/onboarding` at 180 kB with no
headroom. Shared by all routes: 89.4 kB. Manager routes grew with S12 (DataTable bulk, reorder, pagination) and
S13 (activity feed, unified navigation); they are outside the operator budget:

| Route | Last recorded here | Audit-2 |
|---|---:|---:|
| `/admin/<section>` (the ten lists) | 141 kB (S06) | 146 kB |
| `/admin/<section>/[id]` (EntityForm editors) | 166-167 kB (S11) | 169-170 kB |
| `/admin/scripts/[id]` | 175 kB (S11) | 178 kB |
| `/admin/users`, `/admin/trash`, `/admin/activity` | — | 154 / 129 / 109 kB |
| `/dashboard`, `/dashboard/quality` | 133 kB (S09) | 133 kB |
| `/dashboard/content`, `/dashboard/copilot` (new in S13) | 140 kB (S09), — | 140 / 133 kB |

The audit's fixes changed no route: the table before and after is identical, and the middleware bundle reads
123 kB instead of 122 kB (its matcher literal is longer — AUDIT.md F1).

## R3/S01 (2026-09-24, role model v2)

Client-side additions on every operator route: the telemetry tracker's admin no-op (`lib/telemetry/client.ts`),
the role handed to it by `SessionProvider`, and the avatar menu's "Admin panel" item (it reuses `Link` and the
`Database` icon, both already in the operator shell). Measured exactly, because `/company/onboarding` had no
headroom: both trees built with CI's placeholder env, then gzip (level 9) summed over each route's
`app-build-manifest.json` entry — the number `next build` prints, before rounding.

| Route | Before (commit `82765be`) | After | `next build` table |
|---|---:|---:|---:|
| `/company/onboarding` | 180.437 kB | 180.445 kB | 180 kB |
| `/sales-process/scripts` | 169.798 kB | 169.833 kB | 170 kB |
| `/products` | 165.881 kB | 165.900 kB | 166 kB |
| `/` | 160.411 kB | 160.452 kB | 160 kB |
| `/sales-process/battle-cards/[slug]` | 156.336 kB | 156.364 kB | 156 kB |

`/company/onboarding` has **55 bytes** left before the table reads 181 kB. The first version of this change
crossed it (180.596 kB): `lib/telemetry/client.ts` imported `isAdminRole` from `lib/auth/claims.ts` at runtime,
which made webpack move the whole claims module into the shared chunk the tracker lives in (~150 B gzip), and a
default parameter on `setTelemetryOwner` compiled to verbose `arguments` code. A type-only import, a literal
`role === "admin"` and a required parameter brought it back to +8 B. The same applies to any client module on
this path: import `lib/auth/claims.ts` for types only, and compare the role literal.

Admin routes: `/admin/users` 154 kB (its page chunk 8.35 → 8.81 kB: the Admin badge, the locked controls and
their note); the rest unchanged.

## People analytics queries (R3/S02, migration 0021)

**Scan shape.** Like 0016, every function returns aggregates or a capped list — the person timeline's ≤ 100 events
are the only raw rows that leave the database — and there is no per-person loop:

- `admin_people_overview`: one scan of the window's events of the non-admin allow-list, collapsed to (person, day,
  session) by a hash aggregate and then rolled up by GROUPING SETS into day rows and totals in the same pass; a small
  second scan of `call_count_log`; 0016's helpers once each for everyone (active time index-only on the covering
  `(type, ts)` index; zero-result searches by `(type, ts)` plus one primary-key probe per zero-result search to find
  its person; the checklist); and two `(user_email, ts)` index probes per person for first/last seen.
- One person (`admin_person_summary` / `_daily` / `_sections` / `_recent_events`): reads of every event type are range
  scans of `telemetry_events_user_email_ts_idx` (the recent events a backward walk that stops after `p_limit`); page time
  and idle pairs come index-only from the covering `(type, ts)` index. The summary also calls 0016's
  `dashboard_active_ms` and `dashboard_zero_result_events` with the person's email, as the task asked (one definition);
  their `(p_operator is null or user_email = p_operator)` filter reads the window's page_leave/idle and search events
  for everyone and keeps the person's — the shape the dashboard's operator filter has had since S09.
- `admin_top_content`: one scan of the window's six view events and attributed copies (heap fetches for
  `entity_id`/`path`), one primary-key probe per listed item.

**Generic plans.** Postgres ≤ 17 plans a SQL-function body once, without parameter values, and guesses a parameterized
`ts` range at 0.5 % of the table — so `user_email = $1 and ts >= $2 and ts < $3` walks the `(ts)` index across
everyone's events, and `user_email = any($array)` is costed as ten people. 0021 therefore splits one person from
several behind one-time filters and writes the one-person range as a row comparison, `(user_email, ts) >= ($1, $2)`,
which only the `(user_email, ts)` index can serve. With `plan_cache_mode = force_generic_plan`, a 93-day one-person
scan went from 80 ms (the `(ts)` index) to 8 ms; the extracted checklist helper got the same treatment, which also
speeds up `dashboard_operator_activity`'s one-operator card. `dashboard_zero_result_events` (0016) was left as it is.

**Measured latency.** The S09 synthetic set (372 000 rows: 2 000 events a day for 186 days, 30 people, 16 event types,
`vacuum analyze`d) in PGlite 0.5.8, as the admin, median of 3 warm calls. Default and forced-generic plans agree
within noise. Upper bounds again — re-measure on staging.

| Function | 7-day range | 93-day range | 93-day, before the access-path work |
|---|---:|---:|---:|
| `admin_people_overview` (31 rows) | 68 ms | 909 ms | 1 152 ms |
| `admin_person_summary` (both windows) | 36 ms | 234 ms | 703 ms |
| `admin_person_daily` | 10 ms | 36 ms | 201 ms |
| `admin_person_sections` | 3 ms | 8 ms | 83 ms |
| `admin_person_recent_events` (30) | 2 ms | 2 ms | 3 ms |
| `admin_top_content` (10) | 19 ms | 286 ms | 265 ms |
| `dashboard_operator_activity`, for scale (re-created, same numbers) | 33 ms | 511 ms | 505 ms |

All inside the dashboard budget below. The overview at 93 days is the slowest call: it reads every tracked event
of the window once, which is the price of listing everyone with their totals in one round trip.

**Copy attribution (client).** `CopyButton` sends `entityType`/`entityId` with `copy` when its caller knows the item
(two optional props, one `&&` at the click); the call sites pass primitives down, so `ScriptTurnList` stays
memoized. Measured exactly (R3/S01's method: both trees built with CI's placeholder env, gzip level 9 over each
route's `app-build-manifest.json` entry):

| Route | Before (commit `f9b4125`) | After | `next build` table |
|---|---:|---:|---:|
| `/company/onboarding` | 180.468 kB | 180.446 kB | 180 kB |
| `/sales-process/scripts` | 169.865 kB | 169.990 kB | 170 kB |
| `/products` | 165.911 kB | 165.901 kB | 166 kB |
| `/` | 160.476 kB | 160.454 kB | 160 kB |
| `/sales-process/battle-cards/[slug]` | 156.368 kB | 156.367 kB | 156 kB |
| `/sales-process/objections`, `/company/contacts` | 140.918 kB | 140.962 kB | 141 kB |
| `/faq` | 141.198 kB | 141.242 kB | 141 kB |

`/company/onboarding` loads none of the changed modules: its page chunk is byte-for-byte the same length with the
same modules in another order (the order varies between builds), and the webpack runtime's chunk map changed hashes,
so its −22 B is noise, not a saving. It keeps **54 bytes** before the table reads 181 kB. The real cost is on
`/sales-process/scripts` (+125 B: CopyButton, ScriptTurns, the two call sites) and the three `DatabaseTemplate`
pages (+44 B).

## R3/S03 (2026-09-24, one admin shell and the admin overview)

Admin-only change: `/dashboard/*` now mounts `AdminShell` (instead of `ManagerMonitoringHeader` + `DashboardTabs`),
and `/admin` is the new overview with the chart primitives of `components/admin/charts/` (server-rendered; the client
parts are `CompareTable`, `BarGrow`/`BarGrowGroup`, `OverviewRefresh`, `RelativeTime`). No operator layout or shared
module changed; `chrome.managerNav` left the root message list. `next build` table, gzip level 9 over each route's
`app-build-manifest.json` entry (built with the local `.env.local`, not CI's placeholder env, so compare within this
table only):

| Route | `next build` table | Exact |
|---|---:|---:|
| `/admin` | 139 kB | 138.613 kB |
| `/admin/users` | 154 kB | 154.377 kB |
| `/dashboard`, `/dashboard/copilot` | 135 kB | 134.730 kB |
| `/dashboard/quality` | 135 kB | 134.631 kB |
| `/dashboard/content` | 141 kB | 141.106 kB |
| `/company/onboarding` (operator, unchanged code) | 180 kB | 180.321 kB |

## R3/S04 (2026-09-25, people directory and person page)

`/admin/users` became the people directory (`PeopleDirectory` + `PersonCard`, client) and `/admin/users/[email]`
the person page (server-rendered; its only client parts are `PersonAccessPanel`, `CopyButton`, `RelativeTime`,
`BarGrow`/`BarGrowGroup` and `DashboardWidgetError`). No dependency was added and no operator layout or shared
module changed; `dashboard.duration` (two strings) joined the admin client message list. `next build` table:

| Route | Before (S03) | After |
|---|---:|---:|
| `/admin/users` | 154 kB | 164 kB (page chunk 8.81 → 14.4 kB: directory, cards, search/sort logic, `normalizeSearchText`) |
| `/admin/users/[email]` | — | 160 kB (page chunk 7.87 kB, dynamic) |
| `/admin`, `/dashboard`, `/dashboard/quality`, `/dashboard/content` | 139 / 135 / 135 / 141 kB | unchanged |
| `/company/onboarding` (operator) | 180 kB | 180 kB |

**The directory with ~200 people.** One server round trip (`listAdminUsers()` and `admin_people_overview` in
parallel); the per-day series sent per person is 14 bare millisecond values (the days are consecutive, so the
first one travels once as `windowStart` — about 100 B per person, ≈ 20 kB of RSC payload at 200 people, estimated
from the shape, not measured on a 200-row database). Cards are `React.memo` and fetch nothing; the shared "last
active" clock is one `useNow` floored to the minute, so they re-render once a minute; the sparkline is
`ColumnBars compact` — plain `div`s, no `BarGrow`/in-view observer per card (14 motion values × 200 cards would
be 2 800 animated nodes); links do not prefetch (`prefetch={false}`), so scrolling never starts a server render
per card; the search input is deferred (`useDeferredValue`) and sorting is a separate memo from filtering.

**The person page.** Eight RPCs and one allow-list read in one `Promise.all`; each is a 0021 / 0016 aggregate
(no raw telemetry row), so the payload is a few KB whatever the person's history.

## R3/S05 (2026-09-25, `/company/about` → LayersStory)

`/company/about` no longer imports `PipelineStory`/`PipelineChapter` (scene, `CountUp`, `MaskReveal`, `ScrollScene`)
or `Stagger`/`StaggerItem`; it renders `LayersStory` (`LayersChapter`, `LayersCrossSection`, `layers-geometry`,
`hooks/useScrollBeat`). No dependency, no layout or shared module changed. Both trees were built in scratch copies
with CI's placeholder env (the local `next dev` was using the repo's `.next`), `next build` table and gzip level 9
over each route's `app-build-manifest.json` entry:

| Route | Before (`45c4f7d`) | Exact | After | Exact |
|---|---:|---:|---:|---:|
| `/company/about` | 163 kB (page 599 B) | 163.241 kB | **150 kB** (page 2.91 kB) | 150.458 kB |
| `/company/mission-values` | 163 kB (page 236 B) | 162.878 kB | 164 kB (page 5.59 kB) | 163.588 kB |
| `/company/onboarding` | 180 kB | 180.394 kB | **181 kB** | 181.196 kB |

**`/company/about` −12.8 kB.** The pipeline scene and framer-motion's `animate()` (VisualElement, value types — reached
through `CountUp` in the tank finale) are no longer on the route. The new scene is about 2.3 kB of page JS.

**`/company/onboarding` +0.8 kB, over the 180 kB budget — no code change there.** It downloads exactly the same 325
modules as before (module ids compared chunk by chunk). What changed is the packing: before, one chunk shared by
about, mission-values and onboarding held both framer's animation core (springs, keyframes — `useSpring`) and
`animate()`'s VisualElement code (13.4 kB gzip). About now uses only the first, so webpack splits it into a chunk
for all three (6.1 kB) and one for mission-values + onboarding (8.1 kB); two files compress about 0.87 kB worse
than one. `/company/mission-values` moves the same way (+0.7 kB) and its page chunk now carries the pipeline scene
that about no longer shares. The route stays over budget until it is fixed deliberately (see Open items) — the
limit was not raised.

## R3/S06 (2026-09-25, `/company/mission-values` → ManifestStory)

`/company/mission-values` no longer imports `PipelineStory`/`PipelineChapter`/`fittings.tsx` (and with them `MaskReveal`,
`ScrollScene`, the pipeline geometry); it renders `ManifestStory` (`MissionWords`, `VisionSegment`, `ValueStack`,
`manifest-geometry`, reusing `DrawPath` and `CountUp`). The six icons moved to `components/story/value-icons.tsx`, plain
components rendered on the server and handed to the scene as elements, so they cost no JS. No dependency, no layout or
shared module changed, no client message namespace added (the scene's strings arrive as props). Both trees built with
CI's placeholder env (baseline `c7aac74` in a scratch worktree); "Exact" is gzip level 9 over the route's
`app-build-manifest.json` entry, measured the same way for both columns (Python's gzip — about 0.2 kB below the Node
figures of the S05 table, so compare within this table):

| Route | Before (`c7aac74`) | Exact | After | Exact |
|---|---:|---:|---:|---:|
| `/company/mission-values` | 164 kB (page 5.59 kB) | 163.391 kB | **161 kB** (page 3.53 kB) | 161.313 kB |
| `/company/about` | 150 kB | 150.307 kB | 150 kB | 150.265 kB |
| `/company/onboarding` | 181 kB | 180.808 kB | 181 kB | 180.725 kB |

**−2.1 kB, all of it the page chunk.** Every shared chunk of the route has the same size before and after (only the
hashes moved). The scene's scroll work is motion values only — one `useScroll` for the mission sentence feeding 13
word `useTransform`s, and the page `scrollY` feeding one transform per value card; the stack's layout (sentinel
positions, card heights, sticky tops) is measured on mount and on `ResizeObserver` changes, never per frame.
`/company/onboarding` still reads 181 kB (see Open items); nothing it imports changed.

## R3/S07 (2026-09-25, `/company/onboarding` → RouteMap)

`/company/onboarding` no longer imports `OnboardingRail`/`OnboardingNode`/`fittings.tsx` or `CountUp` (and with it
framer's `animate()`); it renders `RouteMap` (`RouteDayCard`, `RouteCheckpoint`, `ProgressRing`, the pure
`route-geometry.ts`). The scroll layer, `RouteTrail` (`ScrollScene` → `useScroll` + `useSpring`, the measured path,
the traveller), is a `next/dynamic` chunk mounted once the page is idle and never under reduced motion, so none of it is
First Load: the server-drawn route is the whole page until then, and the checkboxes work without it. `PipelineStory`,
`PipelineChapter` and `geometry.ts` were deleted with the rail (no importer left). No dependency, no layout or shared
module changed; the new strings sit under `pages.company.onboarding`, already a client namespace. Both trees built
with CI's placeholder env (baseline `1f686b4` in a scratch worktree); "Exact" is gzip level 9 (Python) over the route's
`app-build-manifest.json` entry, measured the same way for both columns:

| Route | Before (`1f686b4`) | Exact | After | Exact |
|---|---:|---:|---:|---:|
| `/company/onboarding` | 181 kB (page 10.8 kB) | 180.708 kB | **160 kB** (page 12.6 kB) | 159.721 kB |
| `/company/about` | 150 kB (page 2.91 kB) | 150.302 kB | 150 kB (page 3.42 kB) | 150.326 kB |
| `/company/mission-values` | 161 kB (page 3.53 kB) | 161.344 kB | 161 kB (page 14.4 kB) | 161.331 kB |
| `/` | 160 kB | 160.198 kB | 160 kB | 160.207 kB |

**−21.0 kB, back under the 180 kB budget.** The route drops the two framer chunks `CountUp` pulled in (the animation
core and `animate()`'s VisualElement code — see R3/S05) and the rail. Every other route's `next build` figure is
unchanged (all 70 rows compared); "shared by all" reads 89.5 kB instead of 89.4 kB (+30 B: the webpack runtime's map
of the new lazy chunks). The page-chunk moves on about and mission-values are packing, not code: `animate()` is now
used by mission-values alone, so it moved into that page's chunk, and the same bytes left a shared one (First Load:
about +24 B, mission-values −13 B).

**What loads later.** `RouteTrail` on idle: 17.9 kB gzip in five files, of which 16.0 kB are the four framer chunks
`/company/about` and `/company/mission-values` already load (cached once either has been visited) and 1.9 kB the scene
itself. Its work is on mount and resize only: one `ResizeObserver` on the route and its segment boxes, the boxes read with
`getBoundingClientRect`, and ≤ 400 `getPointAtLength` samples (one per 8 px of line). Scrolling is motion values only —
four `useTransform`s over the samples (a binary search at most) and a spring; React never re-renders on scroll. A tick
re-renders the four rows (no memo needed at that size) and springs the line's cap; the checkbox flips in the same
frame.

## R3 release audit (2026-09-25)

Built with CI's placeholder env (`CONTENT_BUILD_MODE=allow-empty`), Next.js 14.2.35, Node 22.22; 113 pages generated.
**Every operator route is at or under 180 kB** — 36 operator routes, largest `/sales-process/scripts` 170 kB, then
`/products` 166, `/company/mission-values` 161, `/` 160, `/company/onboarding` 160, `/sales-process/battle-cards/[slug]`
156; `/company/about` 150. Public: `/login` 200 kB (by design, see S14), `/offline` 109 kB. Shared by all: 89.5 kB.

Admin panel (no budget; listed so the next change can compare):

| Route | Page | First Load |
|---|---:|---:|
| `/admin` (overview) | 3.16 kB | 139 kB |
| `/admin/users` (directory) | 14.4 kB | 164 kB |
| `/admin/users/[email]` (person, dynamic) | 7.88 kB | **161 kB** (160 before this audit) |
| `/admin/scripts/[id]` (largest editor) | 6.63 kB | 178 kB |
| other `/admin/<table>/[id]` editors | 0.5–3.6 kB | 169 kB |
| `/admin/<table>` lists | ~160 B | 146 kB |
| `/admin/notifications` · `/admin/trash` · `/admin/versions/…` · `/admin/activity` | | 129 · 129 · 131 · 109 kB |
| `/dashboard` · `/dashboard/content` · `/dashboard/copilot` · `/dashboard/quality` | | 135 · 141 · 135 · 135 kB |

Against the same build before the audit's fixes, one row moved: `/admin/users/[email]` 160 → 161 kB, because
`ConfirmDialog` now imports `hooks/useFocusTrap.ts` (well under 1 kB; on the other admin routes that render the dialog
the change stays inside the table's rounding). The telemetry send gate (`lib/telemetry/client.ts`) and the `RouteDayCard` ring class change
no row. No dependency added.

## `/company/about` → StickyRevealStory (2026-09-26)

`/company/about` no longer imports `LayersStory` (`LayersChapter`, `LayersCrossSection`, `layers-geometry`) or
`hooks/useScrollBeat` (deleted with it, no other user); it renders `StickyRevealStory` with `about-illustrations.tsx`
(five line-art SVGs) and the pure `sticky-reveal-geometry.ts`. No dependency, no layout or shared module changed, no
client message namespace added (the strings arrive as props). Both trees were built in scratch copies with CI's
placeholder env (baseline `f92b726`); "Exact" is gzip level 9 (Node) over the route's `app-build-manifest.json` entry:

| Route | Before (`f92b726`) | Exact | After | Exact |
|---|---:|---:|---:|---:|
| `/company/about` | 151 kB (page 3.42 kB) | 150.513 kB | **146 kB** (page 8.16 kB) | 145.715 kB |
| `/company/mission-values` | 162 kB | 161.551 kB | 162 kB | 161.546 kB |
| `/company/onboarding` | 160 kB | 160.092 kB | 160 kB | 160.054 kB |
| `/` | 160 kB | 160.445 kB | 160 kB | 160.428 kB |

**−4.8 kB.** The old scene smoothed every beat with `useSpring`, which kept framer's animation core (chunk `188`,
6.1 kB gzip — springs and keyframes) on the route; the new one reads `useScroll` straight into state changes and
`m.*` variants, so that chunk is gone, and two small shared chunks (3.5 + 2.7 kB) were repacked into one of 2.8 kB.
The page chunk grows by 4.7 kB: the scene plus the five illustrations (their path data is built by a few shape
helpers, so it is smaller than the SVG markup it renders). Every other row of the route table is identical (70
compared); "shared by all" stays 89.5 kB.

**Runtime.** Two `useScroll`s on the beat list (beat progress, rail), no spring. The active beat is React state set
only when `activeBeatIndex` changes — 8 commits for a full scroll down and back (measured with a MutationObserver on
`data-active-beat`), none per frame. A card layer mounts the first time its beat is active (the server HTML carries
only beat 0), so the static page ships one drawing in the card; below lg each chapter's inline drawing is plain
`<path>`s until it is armed off-screen, then draws once (`useRevealPhase`).

## S03 monitoring IA — one question per admin page (2026-09-26)

The four `/dashboard/*` tabs are gone (307 redirects in `next.config.js`), `/admin` is rebuilt, `/admin/knowledge`
and `/admin/system` are new. No dependency added, no layout or operator module changed. Both trees built in scratch
copies with CI's placeholder env (baseline `e62b9ec`); "Exact" is gzip level 9 over the route's
`app-build-manifest.json` entry.

Admin panel (no budget; the table the next change compares against):

| Route | Before | After | Exact before → after |
|---|---:|---:|---:|
| `/admin` (Bosh panel) | 139 kB (page 5.68 kB) | **136 kB** (page 7.1 kB) | 138.779 → 135.547 kB |
| `/admin/knowledge` (new: took `/dashboard/content`, `/quality`, `/copilot`) | — | 140 kB (page 11.5 kB) | — → 139.920 kB |
| `/admin/system` (new: Web Vitals from `/dashboard`) | — | 133 kB (page 4.79 kB) | — → 133.231 kB |
| `/admin/users` (directory) | 166 kB | 167 kB | 166.403 → 167.098 kB |
| `/admin/users/[email]` (person, dynamic) | 162 kB | 163 kB | 162.056 → 162.740 kB |
| `/admin/scripts/[id]` (largest editor) | 178 kB | 179 kB | 178.303 → 178.888 kB |
| other `/admin/<table>/[id]` editors | 169 kB | 170 kB | +0.6 kB each |
| `/admin/<table>` lists | 146 kB | 146 kB | −0.08 kB each |
| `/admin/notifications` · `/admin/trash` · `/admin/versions/…` · `/admin/activity` | 130 · 129 · 131 · 109 kB | unchanged | +0.02–0.03 kB |
| `/dashboard` · `/content` · `/copilot` · `/quality` | 135 · 141 · 135 · 135 kB | removed | — |

`/admin` loses `BarList`, `ColumnBars` and the `BarGrow` machinery (the four charts became one table with static
`InlineBar`s and server-SVG `Sparkline`s). Every page under the admin layout gains ~0.6 kB: `AdminShell`'s nav now
imports `BookOpenCheck` (knowledge), and `Activity` (system) is shared with the empty-state icons. The people routes
also carry the onboarding chip. `/admin/knowledge`'s page chunk is the content-health quick actions
(`QuickActionButton` → `GateReportDialog`, as `/dashboard/content` had) plus `ContentHealthTabs`.

**Operator routes — +0.03 to +0.45 kB, from removing the routes, not from new code.** `/` 160 → 161 kB (160.460 →
160.830), `/company/onboarding` 160 → 161 kB (160.107 → 160.555), `/sales-process/scripts` 170 kB (169.874 →
170.259), `/products` 166 kB (165.927 → 166.308), `/login` 200 → 201 kB. A third build — HEAD with only
`app/[locale]/dashboard/` deleted — reproduces it (+355 B on `/`, +449 B on onboarding, +240 B on `/login`): once the
four dashboard routes stop sharing zod's helper modules (`ZodIssueCode`, `util`), webpack moves them out of shared
chunk `6243` into the empty-state icons chunk, and they compress less well there. What this change itself adds to
operator routes is ~33 B (two entries in the empty-state registry, `attentionClear` and `knowledgeNoGaps`, both on
the already-loaded `CheckCircle2` icon). Largest operator route: `/sales-process/scripts` 170.259 kB, under the
180 kB budget; "shared by all" stays 89.5 kB.

**Round trips.** Each monitoring page is one document request carrying all of its data — the reads run server-side
in one `Promise.all`; no island fetches. What follows it in the network panel is Next's viewport link prefetching
(nav, range pills, row links), which for these dynamic routes renders only up to their `loading.tsx`; the knowledge
page's per-question FAQ links are `prefetch={false}`.

## Page icons in the operator sidebar (2026-09-27)

Every `siteTree` page has its own lucide icon (`lib/nav-icons.ts`, 39 icons, one per page, checked by
`tests/unit/nav-icons.test.ts`) instead of one per content type (`lib/content-type-icon.tsx`, deleted): the sidebar,
the collapsed rail and its flyouts (whose child rows gained an icon), the phone drawer and the section landing cards.
Admin: the attestation tabs got `ChartColumn` / `Library` / `Settings` (hidden below `sm`, where the three labels
alone fill a 375 px phone), and "Raqobatchilar" `Users` → `Swords`. No dependency and no message namespace added.
Both trees built in scratch copies with CI's placeholder env (baseline `3489ce4`); "Exact" is gzip level 9 over the
route's `app-build-manifest.json` entry.

| Route | Before | After | Exact before → after |
|---|---:|---:|---:|
| `/sales-process/scripts` (largest operator route) | 170 kB | 170 kB | 169.866 → 170.374 kB |
| `/products` | 166 kB | 167 kB | 165.918 → 166.562 kB |
| `/company/mission-values` | 161 kB | 162 kB | 161.136 → 161.779 kB |
| `/` | 160 kB | 161 kB | 160.429 → 160.829 kB |
| `/company/onboarding` | 160 kB | 161 kB | 160.145 → 160.800 kB |
| `/sales-process/scripts/[slug]` (largest change) | 144 kB | 145 kB | 143.574 → 144.775 kB |
| section landings (`/company`, `/tools`, `/tools/amocrm`, …) | 134 kB | 134 kB | 133.520 → 134.172 kB |
| `/admin` · `/admin/scripts/[id]` · `/admin/assessments/items/[id]` | 135 · 179 · 170 kB | 136 · 179 · 170 kB | +0.40 · +0.41 · +0.37 kB |

The table grows by 0.24–1.2 kB per operator route and 0.36–0.44 kB per page under the admin layout; the largest
operator route stays `/sales-process/scripts` at 170.374 kB, under the 180 kB budget; "shared by all" stays 89.5 kB.
The table does not count the `(app)` layout's own chunks, where the sidebar lives, so the measured payload says more
here: 33 prerendered `uz` operator pages (the placeholder env prerenders no `[slug]` page) load **187.8 / 193.5 /
218.4 → 188.1 / 190.6 / 218.2 kB** of scripts (gzip, min / median / max), −4.9 to +0.3 kB per page. `/` now ships 80
lucide icons instead of 52 (31 added; `FlaskConical`, `ListChecks`, `Video` went with the content-type map), and
webpack regrouped the shared chunks around the new module: the empty-state registry, which it used to copy into the
`(app)/not-found` chunk (1.77 → 0.15 kB), now sits once in a shared chunk. That pays for the icons on most pages. HTML
grows 0.9 / 1.5 / 2.4 kB uncompressed (the icons' SVG paths in the server-rendered sidebar and cards).

## `/sales-process/objections` → ObjectionsPlaybook (2026-09-27)

The page no longer renders the five-column `DatabaseTemplate` table; it passes `buildObjectionEntries()` (server,
`lib/content/objection-view.ts`) to the `ObjectionsPlaybook` client island (searchable objection list + one
`ObjectionDetail` answer card, `PinButton`, `CopyButton`, `ContentFade`). No dependency, no layout or shared module
changed. One client message path added to `ROOT_CLIENT_NAMESPACES`: `pages.salesProcess.objections.playbook` (16
short strings per locale). Built with CI's placeholder env against `e62b9ec`:

| Route | Before (`e62b9ec`) | After |
|---|---:|---:|
| `/sales-process/objections` | 141 kB (page 228 B) | **161 kB** (page 8.11 kB) |

+20 kB, under the 180 kB budget: the island itself plus `PinButton`/`usePins` and `ContentFade`, which other routes
already load (so they are shared chunks, not new code). Every other row of the route table is identical; "shared by
all" stays 89.5 kB.

## Per-page sidebar icons, on top of the new nav order (2026-09-27)

`013d9e0` ("every operator page gets its own sidebar icon", `lib/nav-icons.ts`) was cherry-picked from
`claude/modest-bell-fw4n5x` onto the branch that moved the live script into Savdo jarayoni; that branch's own
measurement (`c724be5`) is against its attestation baseline, so this is the same change measured here. CI's
placeholder env, against `e29d2aa`: First Load JS moves by +0 to +1 kB per route (+1 kB on `/faq`,
`/products/comparisons`, `/products/technical-docs`, `/sales-process/battle-cards/[slug]`,
`/sales-process/scripts/[slug]`, `/standards/kpi-system`, `/standards/motivation-bonus`; the rest unchanged at the
table's rounding). The largest operator route is still `/sales-process/scripts` at 170 kB. Page chunks move by up to
±3 kB as the icons regroup between shared chunks; "shared by all" stays 89.5 kB.

## Merge of `claude/modest-bell-fw4n5x` (S03 monitoring IA, R4/S04 attestation, page icons) (2026-09-27)

The merged tree keeps this branch's nav order (Savdo jarayoni first, the live script inside it) with the page icons,
and brings the monitoring IA and the attestation admin pages. CI's placeholder env: the largest operator route is
still `/sales-process/scripts` at 170 kB; `/sales-process/objections` 161 → 162 kB (the zod-helper regrouping the S03
section above describes, not new code); `/admin/assessments` 109 kB, `/admin/assessments/items/[id]` 169 kB,
`/admin/scripts/[id]` 179 kB; "shared by all" stays 89.5 kB. `/login` reads 200 kB, as before (open item 1).

## Open items

1. ~~Supabase browser client imported statically~~ - done in S14, see above. `/login` still imports it, by design.
2. `MiniCalculatorButton` and the certificate lightbox could be split (~1.5 kB gzip each) if a later task names `TopBar`.
3. LCP was not measured in a browser (operator routes need a Google OAuth session); the `priority` choice is by layout.
4. ~~`/company/onboarding` over 180 kB since R3/S05~~ — done in R3/S07 (160 kB, see above).
