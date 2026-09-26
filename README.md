# WaterTech Sales Knowledge Base

Internal sales knowledge base for WaterTech operators (Uzbekistan). See [CLAUDE.md](CLAUDE.md) for the
full architecture, folder map, and coding rules.

Roles (role model v2): `admin` — the owner — runs the admin panel (`/admin`: the Bosh panel overview, Xodimlar,
Bilim sifati, the CMS and system pages; the old `/dashboard` URLs redirect there) and may preview the operator app; `manager` (sales manager) and `operator` use the
operator app only and are the only roles telemetry records. Migrations 0020 (roles) and 0021 (people
analytics) are applied by hand — order, Owner steps and rollbacks in [docs/MIGRATIONS.md](docs/MIGRATIONS.md);
the auth model in [docs/SECURITY.md](docs/SECURITY.md).

## Content pipeline

Content (scripts, objections, FAQs, competitor battle-cards, package tiers, product catalog) is authored
as typed TypeScript arrays in `lib/content/*.ts`, then flows to the app like this:

```
lib/content/*.ts (TS arrays)
  --> npm run seed:content            (supabase/seed/seed-content.ts, *ToRow mappers)
  --> content_* tables in Supabase    (RLS: members read published rows, admin read/write all)
  --> lib/content/loader.ts getters   (unstable_cache, service-role client, filtered to status="published")
  --> Server Components / pages
```

- The TS arrays seed a **staging** project; production content is entered through the admin CMS
  (`/admin`). `npm run seed:content` is **insert-only**: an id that already exists is skipped, so a row the
  admin has edited — its `status` included — stays as saved. Only `--force` overwrites (a real upsert on
  `id`); it never deletes. Run `--dry-run` first; the guard (`supabase/seed/guard.ts`) refuses anything but
  `SEED_TARGET=staging` and any ref listed in `PROD_PROJECT_REFS` (CLAUDE.md §7).
- `sort_order` is set from each array's position at seed time, so the seeded DB renders pages in the same
  order the static arrays did.
- Every content table has `status` (`draft`/`published`), `version`, and a `content_versions` snapshot
  taken on every update (trigger `snapshot_content_version`) — what the admin CMS's history and restore
  (`/admin/versions/…`, `/admin/trash`) read.
- Pages call the typed getters in `lib/content/loader.ts` (`getScripts()`, `getObjections()`, `getFaqs()`,
  `getCompetitors()`, `getPackageGroups()`, `getProducts()`, or `getContentBundle()` for all of the first
  five at once). Each getter is wrapped in `unstable_cache` tagged `"content"` plus its own
  `"content:<name>"` tag, `revalidate: 3600`.
- After writing to a `content_*` table (from a Route Handler / Server Action / the admin CMS), call
  `revalidateContent()` from `lib/content/revalidate.ts` to clear the cache — `/api/search-index`'s own
  cache is tagged `"content"` too, so one call clears both.
- In development, `getContentBundle()` validates the fetched data against the zod schemas in
  `lib/content/schemas.ts` once per server lifetime, so a bad migration or malformed row surfaces
  immediately instead of reaching a page.

## Build requirements

`npm run build` statically prerenders operator pages, which read content through the loaders above —
**a reachable Supabase project with `SUPABASE_SERVICE_ROLE_KEY` set is required for a full build**, not
just for running the app.

The two `[slug]` routes that call `generateStaticParams` (`sales-process/scripts/[slug]`,
`sales-process/battle-cards/[slug]`) fall back to `[]` (rendering each page on demand instead, via
`dynamicParams = true`) when `SUPABASE_SERVICE_ROLE_KEY` is unset or the read throws — e.g. a fresh clone,
or CI with placeholder credentials. This keeps `npm run build` from failing on missing/unreachable
Supabase credentials for those two routes specifically.

This fallback does **not** cover every page: other content pages (`/sales-process/scripts`, `/faq`,
`/products`, `/sales-process/objections`, `/sales-process/battle-cards`, `/tools/calculator`,
…) fetch content directly (not through `generateStaticParams`) and are prerendered at build
time too — if Supabase is unreachable, those page builds fail (`lib/content/safe.ts`, "page" mode), which
keeps the last good ISR page instead of publishing an empty knowledge base. `.github/workflows/ci.yml` builds
against a placeholder project with `CONTENT_BUILD_MODE=allow-empty`, so its operator routes prerender empty;
never set that variable in Vercel, production or `.env.local`.

## Publish gate & daily content scan

- **Publish gate** (`lib/agents/publish-gate/`): every move to `published` — the admin tables' status toggle,
  saving an edit form with status "Nashr etilgan", and the dashboard's "Nashr qilish" quick action — runs
  `runPublishGate` first. Error-severity issues block the write; warnings don't. Each run is logged to
  `content_gate_reports`, and a blocked run also lands in the admin inbox (`/admin/notifications`).
- **Daily scan** (`lib/agents/stale-scan.ts`, `GET /api/cron/content-scan`): flags published rows not updated
  for 90+ days and rows with empty `*_ru` columns, skipping any row that still has an unread notification of
  the same kind, then posts one summary notification.
- Both need migration `supabase/migrations/0007_notifications_and_gate.sql` applied.

The endpoint requires `Authorization: Bearer $CRON_SECRET` (set `CRON_SECRET`, at least 32 characters, in
the deployment env — generate one with `openssl rand -base64 48`) and answers `401` otherwise. On Vercel,
`vercel.json` schedules it daily at 03:00 UTC and Vercel Cron sends that header automatically. **On any
other host**, call it from whatever scheduler you have (system cron, GitHub Actions `schedule`, a
monitoring pinger) with the same header:

```bash
curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://<your-host>/api/cron/content-scan
# -> {"created":3,"skipped":1}
```

## Sharing the codebase

Never zip the working directory by hand — it can pick up `.env.local`, `node_modules`, `.next` or
`test-results` and hand a real `SUPABASE_SERVICE_ROLE_KEY` to whoever receives the archive. Always create
a shareable archive from git's own tracked-file list instead:

```bash
git archive --format=zip -o watertech-kb.zip HEAD
```

`git archive` includes only the files tracked in the `HEAD` commit — no untracked or gitignored files, so
`.env*`, `node_modules/`, `.next/` and `test-results/` are never in the zip. If you need a specific branch
or tag instead of the current checkout, pass it in place of `HEAD` (e.g. `git archive --format=zip -o
watertech-kb.zip main`).

## Secret rotation runbook

Run this whenever a secret may have leaked (e.g. a `.env.local` was shared by mistake), and periodically
as routine hygiene. Rotate one secret at a time and verify it before moving to the next.

1. **Supabase service-role key**
   - In the Supabase dashboard: **Settings → API → API keys → "Create new secret key"** (`sb_secret_...`
     format). Do **not** reuse or "regenerate" the old legacy JWT-based key in place — create a new one.
   - Put the new key in Vercel's project env (`SUPABASE_SERVICE_ROLE_KEY`) and in your local `.env.local`.
   - Redeploy, then confirm content pages, the admin CMS and `/api/copilot` still work (they all go
     through `createAdminClient()`).
   - Once everything is confirmed on the new key, go back to **Settings → API → API keys** and disable
     the old legacy JWT-based service key so a leaked copy of it stops working.
2. **Gemini API key**
   - In [Google AI Studio](https://aistudio.google.com/apikey), delete the old key and create a new one.
   - Put it in Vercel's project env (`GEMINI_API_KEY`) and in local `.env.local`. Redeploy.
   - Confirm `/api/copilot` answers normally (not `503 copilot_disabled`).
3. **CRON_SECRET**
   - Generate a new value: `openssl rand -base64 48`.
   - Set it in Vercel's project env (`CRON_SECRET`). Redeploy.
   - Update whatever scheduler calls the endpoint (Vercel Cron picks up the new env automatically; any
     other scheduler needs its stored header updated by hand).
   - Verify the old secret no longer works and the new one does:
     ```bash
     curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $OLD_CRON_SECRET" \
       https://<your-host>/api/cron/content-scan   # -> 401
     curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $NEW_CRON_SECRET" \
       https://<your-host>/api/cron/content-scan   # -> 200
     ```
