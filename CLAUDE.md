# CLAUDE.md — WaterTech Sales Knowledge Base

> This file is the single source of truth for any AI coding agent working in this repo.
> There is no `AGENTS.md`; if one ever appears, its only content may be `@CLAUDE.md`.
> Read it fully before the first edit of every session. When a task conflicts with a rule
> here, **stop and flag the conflict** — do not improvise.
>
> Last reviewed 2026-09-26 against the repo (roadmap R3: roles v2 · admin analytics · company stories — R3 release
> audit, docs/AUDIT.md; roadmap R4/S04: the attestation's foundation, docs/ATTESTATION.md).
> Sections marked **(R3/Sxx)** or **(R4/Sxx)** describe what that roadmap step introduces. If the code does not have
> it yet, that step has not been merged: implement the step first — never write new code against the old shape.

## 1. What this project is

Internal sales knowledge base for WaterTech operators (Uzbekistan). Operators and sales managers read
call scripts, objection handling, product catalog, FAQ, competitor battle-cards in the **operator app**;
the owner (role `admin`) runs the **admin panel** (`/admin` CMS + people analytics + the attestation, `/dashboard`
monitoring).
~30 users, Google OAuth, allow-list based roles `admin` | `manager` | `operator` — see §7 "Role model v2".

- Framework: **Next.js 14.2 App Router**, React 18, TypeScript `strict`, Tailwind 3.4.
- i18n: **next-intl 3.26** — `uz` (default) and `ru`, routed via `app/[locale]/…`. See §13.
- Backend: **Supabase** (Postgres + Auth + RLS). Browser client via `@supabase/ssr`.
- Animation: **framer-motion only** (GSAP was removed — never add it back). See §14.
- Search: `fuse.js` (client-side index, lazy).
- PWA: **Serwist** (`app/sw.ts`). Error monitoring: **Sentry** (`sentry.*.config.ts`, `instrumentation.ts`) —
  inert until `NEXT_PUBLIC_SENTRY_DSN` is set.
- UI language: **Uzbek (Latin) and Russian** via next-intl, see §13. Product names may be Russian.
  Code, comments, commit messages: English.

Commands:
```
npm run dev          # local dev (never judge performance in dev mode)
npm run build        # production build — MUST pass before a task is "done"
npm run start        # serve the production build
npm run lint         # eslint (next/core-web-vitals + next/typescript)
npm run typecheck    # tsc --noEmit
npm run check:i18n   # no hard-coded UI strings; uz/ru key parity
npm run test         # vitest unit tests
npm run e2e          # Playwright end-to-end tests
npm run gen:types    # regenerate Supabase types (scripts/gen-types.sh)
npm run analyze      # bundle report (Windows: set ANALYZE=true&& next build)
npm run seed:content # seed Supabase content tables from lib/content/*.ts (supabase/seed/seed-content.ts)
```

## 2. Folder map — where things go

> **Target layout** — new files go into the folders below; existing flat files in `components/` move
> only in a task that explicitly says "reorganize" (then `git mv` and update every import). Most of
> `components/` is still flat, so the per-folder file lists below are *targets*. **Where a file is
> today** is §2.1 — look there first; `components/content/` does not exist yet, and `layout/` holds
> only `ShortcutsHelp.tsx`.

```
app/
  layout.tsx                       root: fonts, ThemeScript, providers only — no UI chrome
  sw.ts                            Serwist service worker
  [locale]/                        next-intl locale segment (uz | ru) — see §13
    layout.tsx                     locale layout: unstable_setRequestLocale, NextIntlClientProvider
    (app)/                         operator app; layout.tsx mounts <AppShell>
      <section>/page.tsx           one route = one page.tsx; sections mirror lib/site-config.ts
      <section>/loading.tsx        section-specific skeleton (products, sales-process, dashboard)
    (admin)/admin/                 admin panel: CMS + people analytics (own AdminShell, never imports AppShell)
      users/[email]/               one person's activity page (R3/S04)
      assessments/                 the attestation: results, item bank (items/[id] editor), settings (R4/S04)
    dashboard/                     admin monitoring tabs (rendered inside AdminShell from R3/S03)
    login/                         public
    offline/                      Serwist offline fallback
  api/
    <name>/route.ts                Route Handlers — auth check + zod validation inside, always
    copilot/                       operator copilot endpoint(s)
    cron/content-scan/             scheduled stale-content scanner
    search-index/                  search index endpoint
    events/                        telemetry event ingestion
    content-refs/                  resolves content ids to labels/links for client islands
  auth/callback/route.ts           OAuth exchange
components/
  layout/                          AppShell, Sidebar, TopBar, PageTransition, CommandPalette, Logo
  ui/                               generic primitives: CopyButton, EmptyState, Breadcrumbs, badges, skeletons
  scripts/                         sales-script domain: SalesScriptsTab, ScriptTurns, CallModeOverlay, ObjectionChipRow…
  content/                        DocPageTemplate, PageRenderer, SectionLanding, DatabaseTemplate, BattleCardTemplate
  products/                       CertificateGallery/Grid, product lightbox
  providers/                       SessionProvider, ClientNameContext, CertificateLightboxContext, ThemeScript, TelemetryProvider
  admin/                           CMS forms/editors, AdminShell, UsersTable, AddUserDialog
    charts/                        StatCard, BarList, ColumnBars, CompareTable, DeltaBadge, ChartCard, ProgressBar (R3/S03–S04) — §15
    people/                        PeopleDirectory, PersonCard, PersonCardMenu, PersonAvatar, RoleBadge, PersonHeader,
                                   PersonDetail, PersonTimeline, PersonAccessPanel, RemovePersonDialog,
                                   PeopleActivityList (R3/S04, removal 0022) — §15
    assessments/                   the attestation's admin screens (R4/S04) — §15
  changelog/                       ChangelogEntryCard
  copilot/                        operator copilot UI
  dashboard/                       monitoring widgets/KPIs (RangePicker, OperatorFilter, QualityPanel…)
  home/                            home widgets (ChangelogStrip, ContinueCard, Favourites, Recents); target for DailyTimeline, HomeGreeting
  motion/                          motion primitives — see §14
  onboarding/                      the /company/onboarding scene (RouteMap, R3/S07) — see §14
  story/                           scroll-storytelling scenes, one per /company page — see §14
lib/
  content/                        types.ts + seed data files + loader.ts (typed getters, incl. getContacts/getSops). Pages call getters, never arrays directly. No mock-data folder: every content kind lives in Supabase. safe.ts decides what a failed read does (§8).
  supabase/                        client.ts (browser) · client-lazy.ts (loads client.ts on demand, PERF.md S14) · server.ts (RSC/route) · admin.ts (service role, SERVER ONLY)
  auth/                            claims.ts (role from JWT), server-session.ts, sign-out.ts + purge.ts (shared-device purge, §7), ban.ts (Supabase Auth ban),
                                   delete-account.ts (Supabase Auth account delete, 0022), find-auth-users.ts (the listUsers walk both share)
  user-state/                      per-user state store (pins, onboarding, read receipts); owner.ts namespaces every storage key per account
  auth/session-user.ts             the one place a Supabase user becomes { email, name, role } for client code
  telemetry/                       client.ts (queue), types.ts, aggregate.ts (server)
  search/                          index.ts (lazy Fuse), normalize.ts
  security/                        rate-limit.ts, durable-rate-limit.ts, csp.ts, middleware-matcher.ts (tested copy of the matcher literal, §7)
  admin/                           CMS domain logic. registry.ts is the single description of the
                                   10 content tables (schema, row mapper, list columns, admin path,
                                   cache tag); errors.ts the AdminErrorCode/ActionResult contract;
                                   validation.ts the zod error map + message keys; queries.ts the
                                   generic listRows/listFullRows/getRow; actions/factory.ts the
                                   create/update/remove/setStatus builder and actions/deps.ts what
                                   binds it to a real request. actions/*.ts are thin "use server"
                                   wrappers only — never a second copy of a write body. The three
                                   non-CRUD writes are dependency-injected the same way:
                                   actions/restore.ts (history + trash), actions/user-access.ts
                                   (allow-list), actions/product-image.ts (catalog photos).
                                   people.ts / people-queries.ts (R3/S02) are the 0021 rows and calls;
                                   directory.ts (R3/S04) is the people directory's pure logic (join with
                                   the overview, summary, URL state, search, sort — client-safe) and
                                   person-page.ts the person page's (section labels, timeline sentences).
                                   actions/assessment-admin.ts (DI) + actions/assessments.ts ("use server")
                                   are the attestation's admin writes (R4/S04).
  attestation/                     the attestation (R4/S04, docs/ATTESTATION.md §14): types.ts, schemas.ts and
                                   item-bank.ts are client-safe; rubrics, scoring, items-draw, config,
                                   repository and operator-view are `server-only` — never on a client path
  copilot/                         copilot prompt/response logic (gemini.ts, retrieve.ts, docs.ts, protocol.ts)
  agents/                         server "agents": publish-gate/ (runs before every publish), stale-scan.ts
                                   (daily cron), retention.ts — not copilot code
  notifications/                  publish-gate / stale-content notifications inbox
  dashboard/                       KPI aggregation + RPC mappers for the admin monitoring pages
                                   (people analytics live in lib/admin/people*.ts from R3/S02)
  pwa/                             sw-routes.ts (runtime-cache rules + the sign-out purge list), sw-messages.ts
  motion/                          tokens.ts — durations, easings, spring presets; see §14
  i18n/                            small i18n helpers (e.g. strip-locale.ts) — routing lives in i18n/routing.ts, not here
  env.ts                           zod-validated process.env — the ONLY place that reads process.env
  site-config.ts                   navigation tree (siteTree), breadcrumbs
  types.ts                         cross-cutting UI types (NavNode, PageMeta)
  idle.ts                          scheduleIdle (requestIdleCallback wrapper) — §4 "lazy by default"
  empty-states.ts                  EmptyState registry (icons + message keys)
  content-type-icon.tsx            content type → lucide icon
i18n/
  routing.ts                       next-intl locales, default locale, Link/redirect/usePathname/useRouter — see §13
  request.ts                       next-intl request config (messages loading)
messages/
  uz.json, ru.json                 UI strings, one key set shared across both files — see §13
hooks/                             useTrack, useNow, useMounted, useSessionUser…
supabase/
  migrations/*.sql                 every schema change is a numbered migration file — apply order in docs/MIGRATIONS.md
  seed/                            seed scripts (content TS files are the seed source); guard.ts refuses production (§7);
                                   assessment-items.ts — the attestation bank's staging drafts (R4/S04)
  tests/*.sql                      SQL checks: rls, dashboard-parity, retention, storage, copilot, people, attestation
                                   (staging only, they write rolled-back fixtures); migration-status.sql (read-only,
                                   any project)
tests/
  unit/                            vitest unit tests mirror lib/ paths
  e2e/                             Playwright end-to-end tests
  fixtures/, stubs/                shared test fixtures and stubs
docs/
  ADDING_A_MODULE.md               how to add a new content/domain module
  TESTING.md                       how to run/extend the unit, e2e and SQL suites
  SECURITY.md                      the auth model and the owner's dashboard checklist
  MIGRATIONS.md                    apply order, per-migration runbooks, rollbacks
  PERF.md                          bundle budgets, measuring method, history
  AUDIT.md                         audit findings (Audit-2, S17): fixed, open, residual risk
  ATTESTATION.md                   the attestation's spec: scoring, pace, visibility, data model, S05 API (R4)
public/products/                   catalog images (never rename files — referenced by lib/content/products.ts)
sentry.client.config.ts, sentry.server.config.ts, sentry.edge.config.ts
instrumentation.ts                 Sentry/Next instrumentation hook
```

### 2.1 Where existing files actually are (check here before searching)

```
components/  (flat today)   AppShell  Sidebar  TopBar  PageTransition  CommandPalette  Logo  AvatarMenu
                            Breadcrumbs  PageHeader  CopyButton  EmptyState  ComingSoon  StatusLockBadge
                            DocPageTemplate  PageRenderer  SectionLanding  DatabaseTemplate  BattleCardTemplate
                            ScriptTemplate  SalesScriptsTab  ScriptTurns  ScriptTurnList  CallModeOverlay
                            ObjectionChipRow  ObjectionNavButtons  ObjectionCompetitorSearch
                            CompetitorsTab  CompetitorDetailPanel  PackagesTab  FaqTab  MetadataBadgeRow
                            OnboardingChecklist  DailyTimeline  HomeGreeting  MiniCalculatorButton
                            CertificateGallery  CertificateGrid  CertificateCardTrigger  CertificateLightboxContext
                            ClientNameContext  ClientNameInput  ThemeScript  ThemeToggle  LocaleSwitcher
                            TelemetryProvider  FeedbackWidget
components/admin/           AdminShell  AdminOverview  OverviewRefresh  RelativeTime  NotificationsBell  UsersTable …
components/admin/charts/    ChartCard  StatCard  DeltaBadge  BarList  ColumnBars  CompareTable  BarGrow  BarGrowGroup
                            ProgressBar (R3/S03–S04; pure geometry in lib/admin/charts.ts, overview arithmetic in
                            lib/admin/overview.ts)
components/admin/people/    PeopleDirectory  PersonCard  PersonCardMenu  PersonAvatar  RoleBadge  PersonHeader
                            PersonDetail  PersonTimeline  PersonAccessPanel  RemovePersonDialog  PeopleActivityList
                            (R3/S04; PersonCardMenu + RemovePersonDialog: person removal, 0022)
components/admin/assessments/  AssessmentsSubNav  AssessmentsEmpty  AssessmentResultsTable  ScoreBandBadge
                            AssessmentItemsBank  BankReadiness  AssessmentItemEditor  ItemPublishChecklist
                            AssessmentSettingsForm  RubricOverview (R4/S04)
lib/attestation/            types  schemas  item-bank (client-safe) · rubrics  scoring  items-draw  config  repository
                            operator-view (server-only) (R4/S04)
lib/auth/                   claims  server-session  session-user  sign-out  purge  ban  delete-account  find-auth-users
app/[locale]/(admin)/admin/users/   page.tsx (directory) + loading.tsx, [email]/page.tsx (person) + loading.tsx (R3/S04)
app/[locale]/(admin)/admin/assessments/   layout.tsx (heading + sub-nav) + loading.tsx, page.tsx (results),
                            items/page.tsx (bank), items/[id]/page.tsx (editor; `new` creates), settings/page.tsx (R4/S04)
app/[locale]/(admin)/admin/(overview)/   page.tsx + loading.tsx of /admin — a route group, so the overview has its
                            own skeleton while ../loading.tsx stays the CMS pages' generic one (R3/S03)
components/ui/              Dialog  ErrorBoundary  PinButton  RecentRecorder  Skeleton  SubmitButton  Toaster
                            WidgetBoundary  WidgetFallback  toast-store.ts
components/providers/       SessionProvider  OfflineBanner  WebVitalsReporter
components/products/        ProductsCatalog          components/tools/     BatchCalculator
components/scripts/         ScriptsWorkspace  ScriptsContentContext
components/story/           StickyRevealStory  about-illustrations.tsx  sticky-reveal-geometry.ts (/company/about)
                            ManifestStory  MissionWords  VisionSegment  ValueStack  manifest-geometry.ts  value-icons.tsx
                            (R3/S06, /company/mission-values)
components/onboarding/      RouteMap  RouteDayCard  RouteCheckpoint  ProgressRing  RouteTrail (lazy)  route-geometry.ts
                            (R3/S07, /company/onboarding; OnboardingChecklist, still flat, owns the progress)
hooks/                      useTrack  useSessionUser  useUserState  useSceneProgress  useRevealPhase  useNow
                            useMounted …
```

If a task names a file that is not at the stated path, run `git ls-files | grep -i <name>` before creating
anything — never create a second copy of an existing component. Report the real path in the summary. A task
that adds, moves or deletes files listed here updates this index in the same change.

Rules for placement:
- A **new** file goes into the mapped folder above. Existing flat files in `components/` may only be
  moved in a task that explicitly says "reorganize"; then use `git mv` and update every import.
- One component per file, named export, file name = component name (`PascalCase.tsx`). Hooks `useX.ts`.
  Non-component modules `kebab-case.ts`.
- No barrel `index.ts` re-export files (they defeat tree-shaking and confuse RSC boundaries).
- Never import from `app/**` into `components/**` or `lib/**` (pages are leaves). Shared code moves down.

## 3. Server vs Client Components — the boundary rules

Default is **Server Component**. Add `"use client"` only when the file needs:
state/effects, event handlers, browser APIs, `usePathname/useSearchParams/useRouter`, framer-motion,
context providers/consumers.

- Put `"use client"` on the **smallest leaf** that needs it, not on the page. A page composes server
  markup and passes data as props into small client islands.
- A Client Component must never import `@/lib/supabase/server`, `@/lib/supabase/admin`, `next/headers`,
  `fs`, or `lib/telemetry/aggregate.ts`.
- A Server Component must never import framer-motion, hooks, or anything from `components/providers`.
- Do not call `cookies()` / `headers()` in `app/[locale]/(app)/layout.tsx` or any shared operator layout — it
  forces every operator page dynamic and kills the router cache. (Admin-panel pages — `/admin/**`, `/dashboard/**`
  — are session-scoped and dynamic by nature; reading the session there is expected.) Auth is enforced in `middleware.ts`;
  user display data comes from `SessionProvider` (client, from cookie session, no network).
- Heavy or rarely-used client modules (CommandPalette, Lightbox, CallModeOverlay, admin editors)
  load via `next/dynamic` with `{ ssr: false }` where they have no SSR value.
- `useSearchParams()` must be wrapped in `<Suspense>` (already done on the scripts page).

Hydration safety (hard rules):
- **Never call `new Date()`, `Math.random()`, `window`, `localStorage`, `navigator` during render** —
  including `useState(() => …)` initializers. Use `useNow()` / `useMounted()` / `useEffect`.
  Statically prerendered pages otherwise ship build-time values and hydrate with a mismatch.
- `suppressHydrationWarning` is allowed only on the `<html>` element (theme) and on a single text node
  whose content is intentionally time-dependent — never on containers.
- Read `localStorage` only inside `useEffect`; render a same-size placeholder before mount to avoid CLS.

## 4. Navigation & performance rules (this is a "60 fps, Apple-smooth" product)

- Changing **search params on the same route** → `window.history.pushState/replaceState` (Next ≥14.1
  keeps `useSearchParams` in sync). **Never** `router.push` for that — it triggers a server RSC fetch.
- Do not add exit animations to route transitions. Page transitions are enter-only (opacity/translateY,
  ≤150 ms). Never store `children` in state to "hold" a page.
- Animate only `transform` and `opacity`. No layout-affecting properties (width/height/top) in loops;
  the one exception is the sidebar width toggle (already exists).
- Respect `useReducedMotion()` in every animated component.
- No synchronous work > 2 ms per user event on the main thread: batch `localStorage` writes,
  `JSON.stringify` of large queues goes behind `requestIdleCallback`/debounce.
- Lists > 50 items: `React.memo` rows and stable keys (never array index as key for stateful rows).
- Images: `next/image` with explicit `sizes`; `priority` only on the LCP image of a page.
- Middleware must stay **network-free** on the hot path: JWT verified locally via `getClaims()`, role read
  from the JWT claim, no DB queries. If a task needs data in middleware, stop and ask.
- Keep operator pages statically prerenderable (no `dynamic = "force-dynamic"`, no `cookies()` in pages).
  Data that must be live goes through cached loaders (`unstable_cache` + tags) or client fetch.

### Performance budgets

Measured on a production build only (`npm run build`; `npm run analyze` for the bundle report — on Windows
`set ANALYZE=true&& next build`). Baselines, the measuring method and the exception list live in `docs/PERF.md`.

- **Operator routes: First Load JS ≤ 180 kB** (the `next build` route table). A route above it needs a written
  reason in `docs/PERF.md`; do not raise the number to make a route pass.
- **Client messages:** layouts give `NextIntlClientProvider` only the namespaces in `lib/i18n/client-messages.ts`
  (`pickMessages`). A new `useTranslations("x")` in a client component means adding `x` to that list — the vitest
  test in `tests/unit/i18n/client-messages.test.ts` fails otherwise. Never pass the full `getMessages()` result.
- **Lazy by default:** anything ≥ ~4 kB parsed that is only mounted after an interaction (dialogs, overlays,
  calculators, editors that are not the page's main content) loads via `next/dynamic` and, where the user will
  need it quickly, warms on idle with `scheduleIdle` (see `AppShell`, `ScriptsWorkspace`).
- **Keep heavy libraries out of shared paths:** a client module reachable from a layout or a page's first render must
  not statically import `fuse.js` (`lib/search/index.ts`) or `components/story/*`; import the small pure helper
  (`lib/search/find-stage.ts`, `lib/search/refs.ts`) instead. `lucide-react`: named per-icon imports only.
- Re-run the build and compare the route table with `docs/PERF.md` before merging a change that adds a dependency
  or a client-side import to a layout.

## 5. TypeScript rules

- `strict` stays on. No `any`, no `as unknown as`, no `!` non-null assertions except on
  `process.env` inside `lib/env.ts`. Use narrowing or zod.
- Every content/domain shape lives in `lib/content/types.ts` as an `interface`; every external input
  (API body, form, search params, env) is validated with **zod** and its type is `z.infer<>`.
- Props: inline type for ≤3 props, otherwise a named `XProps` interface above the component.
- Discriminated unions over boolean flags (`{ kind: "objection", … } | { kind: "faq" }`).
- Exported functions have explicit return types when they are part of a `lib/` public surface.
- Never duplicate a constant that exists as data elsewhere (e.g. counts, schedules). Derive it or import it.

## 6. Styling — DESIGN LOCK (never break, regardless of task)

The visual system is locked. You fill existing containers with content; you do not invent visuals.

Colors (light / dark) — the ONLY palette; they are CSS variables in `app/globals.css`, exposed as
Tailwind tokens in `tailwind.config.ts`:
```
--bg  #EDF3F9 / #121C30     --surface  #FFFFFF / #1B2740    --surface-alt  #F8FBFE / #202E4B
--border #DCE6F0 / #2A3B58  --text-primary #1E3A5F / #EFF4FA --text-secondary #5B7086 / #9FB2CC
--accent #3D5A80 / #7FA8D9  --accent-hover #2E4763 / #9DBEE6 --accent-soft, --status-ok/warning/outdated
--on-accent                 text/icon colour on a solid accent fill (never `text-white` on `bg-accent` —
                             it fails contrast in dark mode) — and the focus ring colour there: an inset
                             `ring-primary` on `bg-accent` is invisible (same token); use `ring-on-accent`
--chart-green #1F9D55 / #4ADE80   --chart-blue #2F6FDB / #6EA8FF   --chart-track #E6EEF6 / #24334F   (R3/S03)
                             bar FILLS in admin charts only (Tailwind `bg-chart-green/blue/track`); ≥ 3:1 against
                             surface and surface-alt in both themes (tests/unit/ui/design-tokens.test.ts measures
                             globals.css; values in docs/AUDIT.md). Never for text, never on operator pages.
```
Use semantic classes only: `bg-background bg-surface bg-surface-alt border-border text-primary-dark
text-text-secondary bg-primary text-primary bg-accent text-accent text-status-ok …`.

Forbidden anywhere:
- Hardcoded hex/rgb, Tailwind default palette (`bg-blue-500`, `text-gray-700`, `bg-white`, `bg-black/40`
  → use `bg-primary-dark/40`), inline `style={{ color }}` (inline `style` for computed sizes/positions is fine).
- New CSS classes in `globals.css` or `<style>` tags in components, unless the task is explicitly about
  the design system.
- New card styles, radii, shadows, font sizes outside the existing scale
  (`text-[11px] [12px] [12.5px] [13px] [13.5px] [14px] [15px] [18px] [20px] [24px] [28px] [32px]`,
  radii `rounded-lg xl 2xl`, shadows `shadow-soft softer sm lg`).
- Changing the light/dark mechanism (`ThemeScript` + `class="dark"` + `watertech-theme` key).

Exception: files under `components/story/**`, `components/onboarding/**` (route map) and `components/motion/**`
may introduce new visual language (SVG line art, scroll scenes) as long as they use only the palette tokens
above — no new hardcoded colors. `components/admin/charts/**` may use the chart tokens.

Known drift (Audit-2 O4): the admin area already has `rounded-md` and `text-[11.5px]`. Do not add more; a
design-system task will extend the scale or sweep them. A task that explicitly names the design system may add CSS variables to
`app/globals.css`.

Every UI change must render correctly in **both themes** — check both before finishing.

Structural layout files (`AppShell`, `Sidebar`, `TopBar`, `PageTransition`) may be edited **only when
the task explicitly names the file**, and only structurally (sticky/scroll/loading/perf) — tokens,
spacing scale and the visual language stay identical.

Tailwind discipline: class order = layout → box → typography → color → state (`flex … rounded-2xl …
text-[13px] … bg-surface … hover:bg-primary/5`). Conditional classes via template literals with
explicit strings (Tailwind must see full class names — never build class names from fragments).

## 7. Supabase, auth & security rules

The auth model and the owner's dashboard steps are in [docs/SECURITY.md](docs/SECURITY.md); the
migration apply order and runbooks in [docs/MIGRATIONS.md](docs/MIGRATIONS.md); what the last audit
found, fixed and left open in [docs/AUDIT.md](docs/AUDIT.md).

### Role model v2 (R3/S01, migration 0020)

| Role | Who | Operator app (`/`, `(app)/**`) | Admin panel (`/admin/**`, `/dashboard/**`) | Telemetry |
|---|---|---|---|---|
| `admin` | the owner | yes — preview only | **yes, everything** | never recorded |
| `manager` | sales manager | yes (same UI as operator for now) | **no** → redirected to `/` | recorded |
| `operator` | operator | yes | **no** → redirected to `/` | recorded |

- `homeForRole`: `admin` → `/admin`, `manager` / `operator` → `/`. Admin areas are `ADMIN_AREAS =
  ["/admin", "/dashboard"]` (`lib/auth/claims.ts`); `isAdminArea()` is the only path check.
- Admin rows in `allowed_users` are managed **only in the Supabase SQL editor** (the guard trigger raises
  `WT462` for any write carrying a JWT — a session or the service-role key — that creates, promotes,
  demotes, deactivates, reactivates, deletes or re-addresses (changes the `email` of) an `admin` row;
  `full_name` stays editable). The UI assigns `operator` / `manager` only (`ASSIGNABLE_ROLES` in
  `lib/admin/users.ts`).
- **Removing a person (0022).** An `operator` or `manager` row can be removed at `/admin/users` (someone who
  left); an `admin` row still only in the SQL editor (a DELETE carrying a JWT is `WT462`), and never the
  caller's own (`WT461`) or the last active admin (`WT460`). `removeUser` (`lib/admin/actions/user-access.ts`)
  runs, in this order, each step idempotent so repeating the action after any failure finishes the job:
  checks (session, zod incl. the typed confirmation `removeUserSchema`, the row, `accessViolation` with
  `after: null`) → the Supabase Auth account(s) deleted (`lib/auth/delete-account.ts`, service role; `failed` →
  `auth_sync_failed`, nothing else touched) → with `purgeHistory`, `admin_purge_person_history` (telemetry,
  user_state, copilot_logs, and since 0023 attestation attempts, messages and unlocks; SECURITY DEFINER, refuses a
  non-admin claim or row `WT403`, self `WT461`, an admin row `WT462`) → the allow-list row deleted through the admin's own session (`allowed_users_admin_delete` +
  the guard; `access_audit` records it and is never purged). The row goes last because it is what a retry
  finds the person by.
- SQL helpers: `private.is_member()` = any of the three roles; `private.is_admin()` = `admin` — the one
  to use in every new policy and function. `private.is_manager()` survives only as a **deprecated alias of
  `is_admin()`** because the 0014–0019 policies and function bodies call it by name. Never use it in new SQL
  and never repurpose it for the sales-manager role; a policy that must mean "sales manager" checks
  `private.app_role() = 'manager'` explicitly.
- A deploy that changes a user's role takes effect at their next token refresh (≤ 1 h) — after applying 0020
  the owner signs out and back in.

- **Auth model — four layers, each refusing on its own.** (1) The Custom Access Token hook (0014) issues
  a token only for an active `allowed_users` row and stamps `app_metadata.role` (`admin` | `manager` |
  `operator`); it is inert until enabled in the Supabase dashboard. (2) `middleware.ts` reads that role off
  the locally verified JWT and keeps non-admins out of the admin areas. (3) RLS decides rows, through
  `private.is_member()` / `private.is_admin()` only — never inline `auth.jwt() -> 'app_metadata'` in a
  new policy. (4) Server code re-checks: `getServerSession()` in Route Handlers,
  `requireAdminSession()` first in every admin Server Action, and both admin layouts (`/admin`, `/dashboard`) plus
  every `/dashboard` page refuse a non-admin session (`requireAdminPage`, pinned by
  `tests/unit/auth/admin-gates.test.ts`). A new data-returning SQL function is SECURITY INVOKER and refuses a
  non-admin itself (`WT403`), or is granted to `service_role` only.
- **Middleware matcher.** It may exclude only real static files: the three `public/` folders
  (`certificates/`, `icons/`, `products/`) by file extension, and `sw.js`, `manifest.webmanifest`,
  `favicon.ico` exactly (anchored with `$`), besides `api/`, `auth/callback`, `monitoring`, `_next/*`.
  Never an unscoped extension or an unanchored prefix — that let any `/<route>/<slug>.json` skip the auth
  gate (Audit-2 F1). A new `public/` folder changes `middleware.ts`, `lib/security/middleware-matcher.ts`
  and `tests/unit/security/middleware-matcher.test.ts` together; the parity test enforces the first two.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only. `lib/supabase/admin.ts` is imported only from
  Route Handlers / Server Actions that need to bypass RLS, and the reason is written in a comment.
- Route Handlers and Server Actions: (1) verify session with `getClaims()`, (2) check role from
  `claims.app_metadata.role`, (3) validate body with zod, (4) cap sizes, (5) return typed JSON errors
  (`{ error: string }`) with proper status — in that order, always.
- Never trust client-supplied identity (email, role) in any payload.
- Admin Server Actions return an `AdminErrorCode`, never a sentence and never a database message
  (`lib/admin/errors.ts`: `ActionResult = { ok: true } | { ok: false; code; gate?; field?; details?;
  references? }`). The codes: `unauthorized`, `validation`, `id_taken`, `version_conflict`,
  `gate_blocked`, `not_found`, `reference_in_use`, `email_taken`, `last_admin`, `self_change`,
  `admin_locked`, `auth_sync_failed`, `unknown` (`last_manager` was renamed `last_admin` in R3/S01). A Postgres error is read once, logged with `logDbError`, and collapsed
  into a code — its message, hint and constraint names stay on the server. Database-raised states map
  by SQLSTATE, never by message: `23505` → `id_taken` / `email_taken`, `23503` → `reference_in_use`,
  `23514` / `WT400` → `validation`, `WT403` / `42501` → `unauthorized`, `WT409` → `version_conflict`, `WT460` →
  `last_admin`, `WT461` → `self_change`, `WT462` → `admin_locked`; the attestation's functions add `WT404` →
  `not_found` (`assessmentDbCode`). The client turns the code into copy through
  `hooks/useActionError.ts` and `admin.errors.<code>`; a new code needs both message files (§13) —
  `tests/unit/admin/messages.test.ts` fails otherwise.
- Every argument of a Server Action is browser input, whatever its TS type: parse it with zod (an id with
  `idSchema`, a version as a non-negative integer) before it reaches the publish gate or a query.
- **Publish gate.** Every path that can make a row `published` runs `lib/agents/publish-gate` first and
  writes nothing when it blocks: create/update when saved as published (on the candidate), `setStatus`
  and so bulk publish (on the stored row), a version restore onto a published row (on the merged
  candidate), the dashboard's quick publish. A restore from the trash always comes back as a draft.
- **Attestation (R4/S04, 0023, docs/ATTESTATION.md).** Results are the admin's alone — the first requirement; a
  design that could let an operator or a sales manager read a score is wrong. The six `assessment_*` tables have an
  admin-only permissive policy **and** a restrictive one, and no policy a candidate passes — not even on their own
  attempt. A candidate route (S05) reads through `operatorAttestationRepo(sessionEmail(session))` (service role,
  **every** query filtered by the verified session's email) and answers only what `lib/attestation/operator-view.ts`
  builds (per-day status, `opensOn`, `afterDay` — never a score, band, rubric word, key or explanation). The admin
  writes items and settings under RLS with version guards (audited by trigger) and attempts / unlocks only through the
  five `SECURITY DEFINER` `admin_assessment_*` functions. `rubrics`, `scoring`, `items-draw`, `config`, `repository`
  and `operator-view` import `server-only`; the tables stay out of the CMS registry (no stale scan, trash, versions or
  gate bundle would copy an answer key); `tests/unit/attestation/confidentiality.test.ts` holds all of it. A CHECK
  validator on a table the service role writes never calls another `private.*` function (no `USAGE` there for it).
- A content write goes through `contentActions()` (`lib/admin/actions/factory.ts`) and its registry
  entry, with the RLS-scoped session client — never the service role. Creating uses `.insert()` so a
  taken id fails as `id_taken` instead of overwriting a live row; updating and deleting are guarded on
  the row's `version`. Do not hand-write a new upsert/delete body for a content table.
- Every new table: RLS enabled, policies written in the migration, `updated_at`/`updated_by` columns,
  and explicit `GRANT`s (RLS alone grants nothing here — 0003). Every schema change is a **new** numbered
  file, never an edit to one that ran anywhere; after any policy or grant change,
  `supabase/tests/rls-checks.sql` runs on **staging** (never production — it writes rolled-back
  fixtures). `supabase/tests/migration-status.sql` is read-only and says which files a project has had.
- **Shared devices.** Operators share PCs, so sign-out is a purge (`lib/auth/sign-out.ts` →
  `lib/auth/purge.ts`): uploads and telemetry stop synchronously, the leaving owner's localStorage keys,
  all of sessionStorage and the telemetry buffer go, the service worker deletes its user caches, the
  session is revoked, and a hard navigation replaces the page; another tab's sign-out or account switch
  runs the same purge (`SessionProvider`). So: any new persisted client state uses an owner-namespaced
  key (`lib/user-state/owner.ts`) or is added to `purgeableStorageKeys`; any new service-worker runtime
  cache is listed in `PURGED_CACHE_NAMES` or `KEPT_CACHE_NAMES` (`lib/pwa/sw-routes.ts`, exact names);
  a session-bound GET is `NetworkOnly`. UI preferences (theme, sidebar) are the only un-namespaced keys.
- No `dangerouslySetInnerHTML` with content that can come from the database. Render structured data.
- No CSP nonce exists: `next.config.js` / `lib/security/csp.ts` ship `script-src 'self' 'unsafe-inline'` on purpose
  (a nonce would force every page dynamic, §4). `ThemeScript` is the only inline script — do not add another;
  if a task seems to need one, stop and ask. (Audit-2 O7: the old "use the nonce" rule did not match the code.)
- Secrets and env: read only via `lib/env.ts`; never log env values; never commit `.env*`.
  One exception, and only this one: `supabase/seed/seed-content.ts` and `supabase/seed/guard.ts` read
  `SEED_TARGET`, `PROD_PROJECT_REFS` and `NEXT_PUBLIC_SUPABASE_URL` from `process.env` directly. The
  seed is a developer CLI, not app runtime — it never ships in a bundle, and those variables only
  describe the machine running the command. Nothing under `app/`, `components/` or `lib/` may copy it.
- **Seed rules** (`npm run seed:content`, `supabase/seed/guard.ts`): it runs only with
  `SEED_TARGET=staging`, never against a ref listed in `PROD_PROJECT_REFS` (required for a hosted
  project) and never against an unrecognised host; it is insert-only (existing rows, `status` included,
  stay as the admin saved them) unless `--force`; run `--dry-run` first. Production content is entered
  through `/admin`. Never run the seed, a SQL check file or anything else that writes against production.

## 8. Content layer rules

- Content lives behind typed getters in `lib/content/loader.ts` (`getScripts()`, `getObjections()`,
  `getFaqs()`, `getCompetitors()`, `getPackageGroups()`, `getProducts()`). Pages and server components
  call getters; client components receive data via props. Never import the raw arrays into UI.
- **A failed content read** (`lib/content/safe.ts`) depends on who reads. Pages use the throwing
  getters (`"page"` mode): `ContentUnavailableError` fails `next build` and keeps the last good ISR page
  instead of publishing an empty knowledge base. Route Handlers, the Copilot retriever and the admin
  dashboard use the `…OrEmpty` getters (`"degrade"` mode: log `[content:<kind>]`, return empty).
  `CONTENT_BUILD_MODE=allow-empty` exists for CI's placeholder project only — never in Vercel, production
  or `.env.local`; an unreadable value means `strict`.
- The loaders read with the service role, which RLS does not restrict, so each one filters
  `status = 'published'` itself; a new getter must too. Drafts reach the admin only, through the
  RLS-scoped session client (`lib/admin/queries.ts`).
- Business numbers (discount %, advance %) are numeric fields, never parsed from prose.
- IDs are stable slugs (`obj-qimmat`, `lead-orqali-tushgan`); telemetry references them — never rename
  an id without a migration note.
- Uzbek copy must keep the apostrophe convention used in the file you edit (`o'`, `g'` with `'`).

## 9. Telemetry rules

- Fire events only through `useTrack()` (client) — never call `fetch("/api/events")` directly.
- New event types: add to `TelemetryEventType` union, document the `meta` shape in `types.ts`, and
  extend `aggregate.ts` if the dashboard should show it. `meta` ≤ 600 bytes serialized — the limit
  `lib/telemetry/schema.ts` enforces (the old "500" in this file was wrong, Audit-2 O7).
- Who is tracked (R3/S01): `operator` and `manager` sessions only. An `admin` session sends nothing —
  the client tracker sends nothing until `SessionProvider` has named the role (events queued before wait in
  memory, then go out for an operator/manager or are dropped for an admin), queues nothing afterwards, and
  `/api/events` answers `204` without inserting. Every people/overview
  aggregate counts operators and managers; admin rows show "no telemetry", never zeros presented as idleness.
- People analytics read telemetry only through the 0016/0021 SQL functions (`lib/admin/people-queries.ts`,
  `lib/dashboard/telemetry-window.ts`) — never raw `telemetry_events` rows in a page.

## 10. How to add a page (checklist)

1. Add the node to `lib/site-config.ts` `siteTree` (title, path, contentType, description).
2. Create `app/[locale]/(app)/<path>/page.tsx` as a **Server Component** using `DocPageTemplate` / `PageHeader`.
3. Data via `lib/content/loader.ts` getter. Interactive bits → small client island in `components/<domain>/`.
4. Add `export const metadata` and page copy strings via next-intl (both `messages/uz.json` and
   `messages/ru.json` — see §13).
5. Run `npm run typecheck && npm run lint && npm run test && npm run build`. Open in light + dark. Console: 0 warnings.

## 11. Definition of Done (every task)

- [ ] `npm run typecheck`, `npm run lint`, `npm run check:i18n`, `npm run test`, `npm run build` all pass locally.
- [ ] Files added, moved or deleted → §2 / §2.1 updated in the same change. A new migration → `docs/MIGRATIONS.md`
      and `supabase/tests/migration-status.sql` updated.
- [ ] No hydration warnings, no React key warnings, no console errors on the touched pages.
- [ ] Both themes verified. Mobile (375px) and desktop (1440px) verified for UI changes.
- [ ] No new dependency unless the task explicitly allows it; if allowed, pin a version and explain why.
- [ ] Touched files only — no drive-by reformatting, renaming, or "while I'm here" refactors.
- [ ] Summary at the end: files changed, why, how to verify, anything left open.

## 12. Working style for the agent

- Read the files the task names, plus their direct imports. Do not read the whole repo.
- Prefer editing over rewriting; preserve existing comments that still hold.
- If a rule here blocks the task, or a needed detail is missing, **stop and ask one precise question**.
  Do not guess at design decisions, data models, or auth semantics.
- Roadmap prompts (S01, S02 …) name exact paths and are written against this file. Where a prompt and this
  file disagree, this file wins unless the prompt says it is changing the rule — then update the rule text
  here in the same change.
- The owner applies SQL migrations by hand in the Supabase SQL editor. Every migration you write ends with a
  short "Owner steps" block in `docs/MIGRATIONS.md` (what to run, in which order, what to verify, how to roll back).
- Commit message style: `type(scope): summary` (`perf(middleware): verify JWT locally via getClaims`).

## 13. i18n rules

- Every user-visible string goes through **next-intl**. Server Components call
  `unstable_setRequestLocale(locale)` (already done in `app/[locale]/layout.tsx`) then
  `getTranslations()`. Client Components use `useTranslations()`.
- A new key is added to **both** `messages/uz.json` and `messages/ru.json` in the same commit. Key
  parity between the two files is a hard rule — never add a key to one and not the other.
- Long-form page copy lives under the `pages.<section>.<page>` namespace; shared chrome (nav, header,
  buttons, common labels) lives under the existing shared namespaces — don't invent a new top-level
  namespace for copy that belongs in an existing one.
- Navigation uses `Link` / `useRouter` / `usePathname` from `@/i18n/routing` (see `i18n/routing.ts`),
  never `next/link` or `next/navigation` directly, anywhere in operator UI.
- `aria-label`, `title`, `placeholder`, and toast text are user-visible strings — they go through
  next-intl too, not hardcoded.
- Content-layer data (products, scripts, objections, etc.) uses the existing `*_ru` column pattern
  (see `supabase/migrations/0004_content_ru_columns.sql` and the locale-fallback logic in
  `lib/content/loader.ts`). Do not invent a second localization pattern for content data — that's
  next-intl's job only for UI copy, not for database content rows.

## 14. Motion system

- **framer-motion only.** GSAP, Lenis, locomotive-scroll, and any smooth-scroll or scroll-jacking
  library are forbidden. Never call `preventDefault()` on a wheel/touch event, and never animate the
  window's scroll position programmatically.
- Tokens (durations, easings, spring presets) live in `lib/motion/tokens.ts`. Components import the
  tokens; no inline magic numbers for `duration` / `ease`.
- Motion primitives live in `components/motion/`. Scroll-storytelling scenes live in
  `components/story/`; the onboarding route map, a work page as well, lives in `components/onboarding/`.
- Scroll-linked animation uses motion values only: `useScroll` → `useTransform`/`useSpring`. Never a
  scroll event listener that calls `setState` per frame.
- Allowed animated properties: `transform`, `opacity`, and for SVG line art `pathLength` /
  `stroke-dashoffset`. No filters, no blur, no box-shadow animation, no animating layout properties.
- Reduced motion: render the final state statically — call `useReducedMotion()` and skip the animated
  path entirely. Content must never depend on an animation to become visible or readable; with JS
  disabled, all content is present in normal DOM order.
- Budget: at most one story component per page. On `/company/*` that one component may contain several
  scroll-linked segments (e.g. a word reveal followed by stacked cards) — they are still one scene with one
  owner file. Everything else is motion that answers a user action (open, expand, copy, select) — no generic
  fade-up on every section.
- Every `/company/*` page has its **own** scene; never reuse one page's scene on another (R3/S05–S07):
  `about` → `StickyRevealStory` (sticky scroll reveal: the chapters scroll past a sticky card that shows one bespoke
  line-art illustration per beat — four chapters, then the finale);
  `mission-values` → `ManifestStory` (word-by-word mission, vision 2030 bars, stacked value cards);
  `onboarding` → `RouteMap` (journey route, checkpoints show the reader's real checklist progress).
- `StickyRevealStory` sets React state for the active beat (`activeBeatIndex` in `sticky-reveal-geometry.ts`, the
  breakpoint closest to the list's `useScroll` progress) only when the index changes — at most one render per beat
  boundary, never per frame. Emphasis is a rail (`scaleY`), an accent marker and an instant class swap of the title
  colour — never opacity-dimmed text (axe runs on the page). The card crossfades (opacity + `y`); a beat's main
  strokes draw once, the first time it is active. Its illustrations (`about-illustrations.tsx`) are palette-only line
  art — `stroke-accent`, `stroke-primary-light`, `fill-primary-light/10…/20`, no `<text>`, gradients, filters or
  images (`tests/unit/story/about-illustrations-palette.test.ts`) — and render plain `<path>`s unless drawing.
- `RouteMap` is presentation only (`OnboardingChecklist` owns state, storage and telemetry) and comes in two layers.
  The server HTML draws the whole route — one small svg per segment, dashed, solid up to the reader — which is the
  final state reduced motion, no-JS and the first paint show. `RouteTrail` (`next/dynamic`, mounted on idle, never
  under reduced motion) measures those segments into one path with the same curves (`route-geometry.ts`), takes
  over the solid line and draws it with scroll up to the reader's checkpoint, with a traveller dot placed from
  `getPointAtLength` samples taken on mount/resize only. What was on screen when it took over stays drawn (the
  `useRevealPhase` contract per pixel of line). The day checkbox is a native input and never waits for motion.
- Animated elements are `m.*` under the `LazyMotion strict` provider (`components/motion/MotionProvider.tsx`),
  never `motion.*`. Scroll progress comes from `components/motion/ScrollScene.tsx` (`useScroll({ target })`
  against the document — AppShell has no inner scroll container) read through `useSceneProgress()`; a segment
  that needs its own progress calls `useScroll({ target })` the same way (`StickyRevealStory`: one over its beat
  list). Pinning uses CSS `position: sticky` only (sticky offsets must clear the sticky TopBar).
- Operator work pages (scripts, objections, FAQ, products, calculator, call mode) never get scroll
  scenes — only ≤200 ms response motion. Scroll storytelling is reserved for `/company/*` and
  empty/onboarding states. `/company/onboarding` reads 160 kB since R3/S07 (it was at the 180 kB limit): keep
  its scroll machinery in the lazy `RouteTrail`, and keep `CountUp` (framer's `animate()`) off that route.

## 15. Admin panel UI (R3/S03–S04)

- **One shell.** `/admin/**` and `/dashboard/**` both render inside `components/admin/AdminShell.tsx`. Its left
  nav comes from the grouped config in `lib/admin/nav.ts` (groups: Monitoring · Content · System) — a new
  admin page is added there once, and `tests/unit/admin/nav.test.ts` checks it against the pages on disk and
  both message files (labels under `admin.nav`). The old Dashboard ↔ Admin switch, `ManagerMonitoringHeader` and
  `DashboardTabs` are gone; each `/dashboard/*` page renders its own `PageHeader`. The header has "Operator view"
  (`/`). `AdminShell` is mounted by both layouts, so what it reads must be in both client lists
  (`admin.shell`, `admin.nav` in `DASHBOARD_CLIENT_NAMESPACES`; the client-messages test checks both).
- **People.** `/admin/users` ("Xodimlar") is the people directory: one server read of `listAdminUsers()` plus
  `admin_people_overview` for the last 14 Tashkent days, joined by email (`buildDirectory`), then everything —
  role tabs (a real `tablist`, arrow keys, counts follow the search), search (`normalizeSearchText`: case,
  apostrophes, Cyrillic), sort (activity · active time · name · added) and the cards ⇄ table view — is client-side
  over the full list. The state lives in `?role=&q=&sort=&view=`: read on the server for the first paint
  (`parseDirectoryState`), written back with `history.replaceState` (§4). Cards are memoized, fetch nothing and
  do not prefetch; an operator's or sales manager's card (never an admin's, never the caller's) has a ⋯ menu
  (`PersonCardMenu`, beside the card link, not inside it — WAI-ARIA menu button: arrows, Home/End, Escape and
  outside click close it, focus returns to the button) with "Open profile", "Deactivate"/"Activate" and "Remove".
  The directory owns the one `ConfirmDialog` and the one `RemovePersonDialog` those open and passes every card
  the same `useCallback` handlers, so memo holds. The table view is `UsersTable` with `hideToolbar` (the
  directory's controls drive it); its rows get a "Remove" action beside activate/deactivate (not on a locked
  row). `RemovePersonDialog` (on `ConfirmDialog`'s body slot) spells out the consequences, has "also delete
  activity history" off by default, and enables its danger button only once the email is typed again
  (`normalizeConfirmEmail`); a success toasts (`toast.personRemoved*`) and `router.refresh()`es, which drops
  the card and updates the summary strip. The
  summary strip counts operators + managers only (the admin is listed, never counted); "Faol (7 kun)" is any event
  in the last 7 days of the 14-day window, "Nofaol" the rest. Each card links to `/admin/users/[email]` built by
  `personPath(email)` (encodeURIComponent) and parsed back by `parsePersonParam()` (zod `userEmailSchema`) →
  `notFound()` for anything not in `allowed_users`. The list is driven by `allowed_users`, so a newly added person
  appears without any other change: `AddUserDialog` calls `router.refresh()` after `addUser`, and the (dynamic) page
  re-reads both sources — there is no cache or `revalidatePath` involved.
- **Person page.** `/admin/users/[email]` reads the allow-list row and every widget's RPC in one `Promise.all`
  (`fetchPerson*` in `lib/admin/people-queries.ts`: 0021 functions plus `dashboard_hourly` / `_most_viewed` /
  `_zero_result_searches` with `p_operator`); no row → `notFound()`, an admin row → no numbers (telemetry is never
  recorded for that role) and the locked note instead of `PersonAccessPanel`. Below its controls
  `PersonAccessPanel` has a danger zone ("Remove employee", not on the caller's own row); after a removal it
  `router.replace("/admin/users")`s and `router.refresh()`es — the page itself is a 404 now. Timeline lines are
  `pages.admin.people.events.<type>` sentences built by `buildTimeline`: entity titles from the content bundle, meta
  only through the zod-validated known keys. Wherever a gmail is shown and that person is on the allow-list it links
  here (overview compare table, `PeopleActivityList` on `/dashboard`, the table view, the activity feed's actors).
- **Charts** are server-rendered divs/SVG from `components/admin/charts/` — no chart dependency. Bar length is
  an inline `style` percentage (computed size, allowed by §6); the only motion is a one-time `scaleX`/`scaleY`
  grow via `m.*` (`BarGrow`), driven per chart by one `BarGrowGroup` on `useRevealPhase`: the server HTML, reduced
  motion and a chart already on screen at mount show the final bars; a chart below the fold grows once when it
  scrolls in. `CompareTable` is the one client chart: a function cannot cross the Server → Client boundary, so
  each cell arrives rendered (`content`) with its `sortValue`. Fills use `bg-chart-green` (time/activity) and
  `bg-chart-blue` (content usage) on `bg-chart-track`; values sit next to the bar as text in
  `text-primary-dark tabular-nums` — colour never carries the number alone.
- **Every widget fails alone**: data arrives as `WidgetData<T>`; a failed call renders `DashboardWidgetError`
  in that widget's slot, an empty result renders `EmptyState` — never a silent zero.
- Numbers, dates and durations are formatted with the active locale (`Intl.*`, `lib/dashboard/format.ts`);
  relative times ("2 soat oldin") render after mount via `useNow()` (§3 hydration rules). Never render
  `Intl` output of `uz-UZ` in a client component before mount: Node's ICU and the browser format it differently,
  which is a hydration mismatch (`components/admin/RelativeTime.tsx` shows a plain `YYYY-MM-DD HH:MM` until then).
- **Attestation (R4/S04).** `/admin/assessments` ("Attestatsiya", Monitoring, after "Xodimlar") has one sub-nav —
  Natijalar · Savollar banki · Sozlamalar — under `app/[locale]/(admin)/admin/assessments/layout.tsx`, and every page
  calls `requireAdminPage` before its first read (`tests/unit/auth/admin-gates.test.ts`). Copy is under
  `pages.admin.assessments.*`. Natijalar is the "Hali topshirilgan attestatsiya yo'q" empty state until someone
  submits (S07 builds the results matrix). The item bank's filters live in `?day=&topic=&status=&difficulty=&q=`
  (`lib/attestation/item-bank.ts`, written back with `history.replaceState`); its rows carry no answer key or
  explanation. The editor (`items/[id]`, `new` creates — never an item id) is built from the CMS primitives, not the
  registry, with the publish checklist live beside the form (`itemPublishChecks`, the rules the action and the
  database apply again). Settings save one version-guarded row; the rubrics are rendered on the server only
  (`RubricOverview`, plain strings — `rubrics.ts` is `server-only`). A score shows as `ScoreBandBadge`: percentage and
  band name as text, the band colour only as a dot and tint.