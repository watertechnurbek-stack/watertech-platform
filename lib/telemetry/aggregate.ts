import type { ContentBundle } from "@/lib/content/loader";
import { dailySchedule } from "@/lib/content/daily-schedule";
import type { TelemetryEventType } from "./types";

export { TOTAL_ONBOARDING_ITEMS } from "@/lib/content/onboarding";

/** Shape of a row as it comes back from `telemetry_events` — snake_case,
 * unlike the client-side TelemetryEvent. The dashboard no longer reads raw
 * rows (0016 aggregates in SQL, see lib/dashboard/telemetry-window.ts); the
 * aggregate* functions below are the reference implementation that
 * tests/unit/dashboard/parity.test.ts holds the SQL functions to. */
export interface TelemetryRow {
  id: number;
  user_email: string;
  session_id: string;
  ts: string;
  type: TelemetryEventType;
  path: string;
  entity_type: string | null;
  entity_id: string | null;
  duration_ms: number | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

// Uzbekistan runs a single, DST-free UTC+5 offset year-round, so a fixed
// offset is correct here without pulling in a timezone library — this
// wouldn't hold for an app spanning multiple timezones.
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;

export function todayInTashkent(): string {
  return tashkentDateOf(Date.now());
}

/** The Tashkent calendar date (YYYY-MM-DD) of an instant — epoch ms or an ISO
 * string. The attestation's pace rule (lib/attestation/schedule.ts) compares
 * these. */
export function tashkentDateOf(instant: number | string): string {
  const ms = typeof instant === "number" ? instant : Date.parse(instant);
  return new Date(ms + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The Tashkent calendar date (YYYY-MM-DD) an instant falls on; null for an
 * unparsable timestamp. */
export function tashkentDayOf(iso: string): string | null {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? null : new Date(ms + TASHKENT_OFFSET_MS).toISOString().slice(0, 10);
}

export function isValidDateString(s: string | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(new Date(s).getTime());
}

/** Converts a Tashkent calendar date (YYYY-MM-DD) into the matching
 * [start, end) UTC instant range, for querying the timestamptz `ts` column. */
export function tashkentDayRangeUTC(dateStr: string): { startUTC: string; endUTC: string } {
  const startUTC = new Date(new Date(`${dateStr}T00:00:00.000Z`).getTime() - TASHKENT_OFFSET_MS);
  const endUTC = new Date(startUTC.getTime() + 24 * 60 * 60 * 1000);
  return { startUTC: startUTC.toISOString(), endUTC: endUTC.toISOString() };
}

// --- Human-readable labels for viewed entities, from data that already
// exists (no new content) — a raw id like "obj-qimmat" means nothing to a
// manager glancing at the dashboard.
export interface EntityLabelMaps {
  scriptNameById: Map<string, string>;
  stageLabelById: Map<string, string>;
  objectionLabelById: Map<string, string>;
  competitorNameById: Map<string, string>;
  packageNameById: Map<string, string>;
}

export function buildEntityLabelMaps(bundle: ContentBundle): EntityLabelMaps {
  return {
    scriptNameById: new Map(bundle.scripts.map((s) => [s.id, s.name])),
    stageLabelById: new Map(
      bundle.scripts.flatMap((s) => s.stages.map((st) => [st.id, `${s.name} — ${st.label}`] as const))
    ),
    objectionLabelById: new Map(bundle.objections.map((o) => [o.id, o.label])),
    competitorNameById: new Map(bundle.competitors.map((c) => [c.id, c.name])),
    packageNameById: new Map(bundle.packageGroups.flatMap((g) => g.packages.map((p) => [p.id, p.name] as const))),
  };
}

export function resolveEntityLabel(
  type: TelemetryEventType,
  entityId: string | null,
  path: string,
  maps: EntityLabelMaps
): string {
  if (!entityId) return path;
  switch (type) {
    case "script_select":
      return maps.scriptNameById.get(entityId) ?? entityId;
    case "stage_view":
      return maps.stageLabelById.get(entityId) ?? entityId;
    case "objection_view":
      return maps.objectionLabelById.get(entityId) ?? entityId;
    case "competitor_view":
      return maps.competitorNameById.get(entityId) ?? entityId;
    case "package_view":
      return maps.packageNameById.get(entityId) ?? entityId;
    case "faq_view":
      return entityId; // already the question text — see scripts/page.tsx tracking
    default:
      return entityId;
  }
}

/** Admin CRUD edit route for a viewed entity, when one exists. Objection,
 * competitor and package each have a dedicated editor and are tracked with
 * the content id itself as entity_id, so the route is a direct lookup;
 * faq_view is tracked with the question text as entity_id instead (see
 * components/FaqTab.tsx), which doesn't identify a row, so it has no link.
 * Scripts don't have an editor yet (nested stage/turn structure — see
 * app/(admin)/admin/scripts/page.tsx), so both script types point at that
 * section's read-only overview instead of a specific row. */
export function resolveAdminHref(type: TelemetryEventType, entityId: string | null): string | null {
  switch (type) {
    case "objection_view":
      return entityId ? `/admin/objections/${entityId}` : null;
    case "competitor_view":
      return entityId ? `/admin/competitors/${entityId}` : null;
    case "package_view":
      return entityId ? `/admin/packages/${entityId}` : null;
    case "script_select":
    case "stage_view":
      return "/admin/scripts";
    default:
      return null;
  }
}

const VIEW_TYPES: ReadonlySet<TelemetryEventType> = new Set([
  "script_select",
  "stage_view",
  "objection_view",
  "competitor_view",
  "package_view",
  "faq_view",
]);

export interface OperatorSummary {
  email: string;
  activeMs: number;
  topViewed: { label: string; count: number; adminHref: string | null }[];
  copyCount: number;
  checklistCompleted: number;
  checklistTotal: number;
  checklistPercent: number | null;
}

/** null when there is no checklist to measure against. */
export function checklistPercent(completed: number, total: number): number | null {
  return total > 0 ? Math.round((completed / total) * 100) : null;
}

/** Total idle time for one operator's events — idle_start/idle_end are
 * paired sequentially per session_id (they alternate by construction on
 * the client, so a simple scan is sufficient; an unmatched trailing
 * idle_start, e.g. the operator went idle and the page was closed before
 * idle_end could fire, contributes nothing rather than guessing an end). */
function computeIdleMs(rows: TelemetryRow[]): number {
  const pendingStartBySession = new Map<string, string>();
  let total = 0;
  const idleEvents = rows
    .filter((r) => r.type === "idle_start" || r.type === "idle_end")
    .sort((a, b) => a.ts.localeCompare(b.ts));

  for (const e of idleEvents) {
    if (e.type === "idle_start") {
      pendingStartBySession.set(e.session_id, e.ts);
    } else {
      const startTs = pendingStartBySession.get(e.session_id);
      if (startTs) {
        total += new Date(e.ts).getTime() - new Date(startTs).getTime();
        pendingStartBySession.delete(e.session_id);
      }
    }
  }
  return total;
}

export function aggregatePerOperator(rows: TelemetryRow[], checklistTotal: number, maps: EntityLabelMaps): OperatorSummary[] {
  const byEmail = new Map<string, TelemetryRow[]>();
  for (const r of rows) {
    const list = byEmail.get(r.user_email) ?? [];
    list.push(r);
    byEmail.set(r.user_email, list);
  }

  const summaries: OperatorSummary[] = [];
  for (const [email, evs] of byEmail) {
    const pageLeaveMs = evs.filter((e) => e.type === "page_leave").reduce((sum, e) => sum + (e.duration_ms ?? 0), 0);
    const activeMs = Math.max(0, pageLeaveMs - computeIdleMs(evs));

    const counts = new Map<string, { label: string; count: number; adminHref: string | null }>();
    for (const e of evs) {
      if (!VIEW_TYPES.has(e.type)) continue;
      const key = `${e.type}:${e.entity_id ?? e.path}`;
      const label = resolveEntityLabel(e.type, e.entity_id, e.path, maps);
      const existing = counts.get(key);
      if (existing) existing.count += 1;
      else counts.set(key, { label, count: 1, adminHref: resolveAdminHref(e.type, e.entity_id) });
    }
    const topViewed = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);

    const copyCount = evs.filter((e) => e.type === "copy").length;

    // Latest toggle per checklist item that day decides its checked state —
    // toggling an item on and off again shouldn't double-count.
    const latestCheckedByItem = new Map<string, boolean>();
    for (const e of evs
      .filter((e) => e.type === "checklist_toggle" && e.entity_id)
      .sort((a, b) => a.ts.localeCompare(b.ts))) {
      latestCheckedByItem.set(e.entity_id as string, !!(e.meta as { checked?: boolean } | null)?.checked);
    }
    const checklistCompleted = [...latestCheckedByItem.values()].filter(Boolean).length;

    summaries.push({
      email,
      activeMs,
      topViewed,
      copyCount,
      checklistCompleted,
      checklistTotal,
      checklistPercent: checklistPercent(checklistCompleted, checklistTotal),
    });
  }

  return summaries.sort((a, b) => b.activeMs - a.activeMs);
}

/** Narrows a fetched row set down to one operator — every dashboard
 * aggregator takes the row set only (never a query param), so a page filters
 * once here before handing rows to whichever aggregators it needs. */
export function filterRows(rows: TelemetryRow[], filters: { operatorEmail?: string | null }): TelemetryRow[] {
  if (!filters.operatorEmail) return rows;
  return rows.filter((r) => r.user_email === filters.operatorEmail);
}

export function aggregateZeroResultSearches(rows: TelemetryRow[]): { query: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== "search") continue;
    const meta = r.meta as { query?: string; resultCount?: number } | null;
    if (!meta || meta.resultCount !== 0 || !meta.query) continue;
    const key = meta.query.trim().toLowerCase();
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([query, count]) => ({ query, count }))
    .sort((a, b) => b.count - a.count);
}

export const PLANNED_HOURS: { id: number; startHour: number; endHour: number }[] = dailySchedule
  .filter((item) => !item.isLunch)
  .map((item) => {
    const [endH, endM] = item.end.split(":").map(Number);
    return {
      id: item.id,
      startHour: parseInt(item.start, 10),
      endHour: Math.ceil((endH * 60 + endM) / 60),
    };
  });

export interface WebVitalSummary {
  name: string;
  p50: number;
  p75: number;
  samples: number;
}

function percentile(sortedValues: number[], p: number): number {
  const idx = Math.min(sortedValues.length - 1, Math.floor(p * sortedValues.length));
  return sortedValues[idx];
}

/** Per-metric p50/p75 across a day's `web_vital` rows (meta: { name, value,
 * rating } — see TelemetryEvent). Metrics with no samples that day are
 * simply absent from the result, not zero-filled. */
export function aggregateWebVitals(rows: TelemetryRow[]): WebVitalSummary[] {
  const valuesByName = new Map<string, number[]>();
  for (const r of rows) {
    if (r.type !== "web_vital") continue;
    const meta = r.meta as { name?: string; value?: number } | null;
    if (!meta?.name || typeof meta.value !== "number") continue;
    const values = valuesByName.get(meta.name) ?? [];
    values.push(meta.value);
    valuesByName.set(meta.name, values);
  }

  return [...valuesByName.entries()]
    .map(([name, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      return { name, p50: percentile(sorted, 0.5), p75: percentile(sorted, 0.75), samples: sorted.length };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Actual event counts per Tashkent-local hour, for comparing against
 * PLANNED_HOURS. Server-side `Date#getHours()` follows the server's own
 * timezone, not Tashkent's, so the offset is applied explicitly first. */
export function aggregateHourly(rows: TelemetryRow[]): number[] {
  const counts = new Array(24).fill(0);
  for (const r of rows) {
    const hour = new Date(new Date(r.ts).getTime() + TASHKENT_OFFSET_MS).getUTCHours();
    counts[hour] += 1;
  }
  return counts;
}
