import "server-only";
import { resolveEntityLabel, resolveAdminHref, type TelemetryRow, type EntityLabelMaps } from "@/lib/telemetry/aggregate";
import { createClient } from "@/lib/supabase/server";
import { TRACKED_ROLES } from "@/lib/auth/claims";
import { ONBOARDING_KEY, onboardingStateSchema } from "@/lib/user-state/keys";
import { onboardingSummaryChecklist } from "@/lib/content/onboarding";
import type { WidgetData } from "@/lib/dashboard/telemetry-window";

export interface NotHelpfulGroup {
  path: string;
  count: number;
}

/** FeedbackWidget (components/FeedbackWidget.tsx) fires `feedback` events as
 * `{ meta: { helpful } }` only — no entityType/entityId (see useTrack's
 * payload) — so `path` is the only thing that actually varies between rows.
 * Grouping by path is the closest meaningful grouping this data supports; a
 * truly per-entity breakdown would need FeedbackWidget's call sites changed
 * to pass entityType/entityId, which is out of this task's scope. Display
 * label resolution (site-config's node.title is a next-intl "nav" namespace
 * key, not literal text) is the caller's job — see
 * components/admin/knowledge/NotHelpfulCard.tsx. */
export function aggregateNotHelpful(rows: TelemetryRow[]): NotHelpfulGroup[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (r.type !== "feedback") continue;
    const meta = r.meta as { helpful?: boolean } | null;
    if (meta?.helpful !== false) continue;
    counts.set(r.path, (counts.get(r.path) ?? 0) + 1);
  }
  return [...counts.entries()].map(([path, count]) => ({ path, count })).sort((a, b) => b.count - a.count);
}

/** Known content list pages a not-helpful path can be traced back to an
 * admin section for — doc pages (amocrm guides, standards, logistics, …)
 * have no content_* row to edit, so those simply get no "Tahrirlash" link. */
const PATH_TO_ADMIN_SECTION: { prefix: string; href: string }[] = [
  { prefix: "/faq", href: "/admin/faq" },
  { prefix: "/sales-process/objections", href: "/admin/objections" },
  { prefix: "/sales-process/battle-cards", href: "/admin/competitors" },
  { prefix: "/products", href: "/admin/products" },
];

export function resolveContentAdminHref(path: string): string | null {
  const match = PATH_TO_ADMIN_SECTION.find((p) => path === p.prefix || path.startsWith(`${p.prefix}/`));
  return match ? match.href : null;
}

export interface ZeroResultQueryGroup {
  query: string;
  count: number;
  lastSeenIso: string;
}

export function aggregateZeroResultQueriesDetailed(rows: TelemetryRow[]): ZeroResultQueryGroup[] {
  const byQuery = new Map<string, { count: number; lastSeenIso: string }>();
  for (const r of rows) {
    if (r.type !== "search") continue;
    const meta = r.meta as { query?: string; resultCount?: number } | null;
    if (!meta || meta.resultCount !== 0 || !meta.query) continue;
    const key = meta.query.trim().toLowerCase();
    if (!key) continue;
    const existing = byQuery.get(key);
    if (existing) {
      existing.count += 1;
      if (r.ts > existing.lastSeenIso) existing.lastSeenIso = r.ts;
    } else {
      byQuery.set(key, { count: 1, lastSeenIso: r.ts });
    }
  }
  return [...byQuery.entries()]
    .map(([query, v]) => ({ query, ...v }))
    .sort((a, b) => b.count - a.count);
}

export interface MostViewedItem {
  label: string;
  count: number;
  adminHref: string | null;
}

const MOST_VIEWED_TYPES: ReadonlySet<TelemetryRow["type"]> = new Set(["stage_view", "objection_view", "faq_view"]);

/** Length of the retired Sifat tab's "most viewed" list — passed to
 * public.dashboard_most_viewed as p_limit, and the reference default below. */
export const MOST_VIEWED_LIMIT = 10;

/** The not-helpful, zero-result and most-viewed aggregators in this file are
 * the reference for public.dashboard_not_helpful / _zero_result_searches /
 * _most_viewed (0016) — see tests/unit/dashboard/parity.test.ts. */
export function aggregateMostViewed(rows: TelemetryRow[], maps: EntityLabelMaps, limit = MOST_VIEWED_LIMIT): MostViewedItem[] {
  const counts = new Map<string, MostViewedItem>();
  for (const r of rows) {
    if (!MOST_VIEWED_TYPES.has(r.type)) continue;
    const key = `${r.type}:${r.entity_id ?? r.path}`;
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      counts.set(key, {
        label: resolveEntityLabel(r.type, r.entity_id, r.path, maps),
        count: 1,
        adminHref: resolveAdminHref(r.type, r.entity_id),
      });
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export interface OnboardingProgressRow {
  email: string;
  completed: number;
  total: number;
  /** When that operator last ticked something, or null if they never have. */
  updatedAtIso: string | null;
}

/** One row per operator on the allow-list — including the ones who have never
 * opened the checklist, which is exactly who a manager is looking for — with
 * the least advanced first. Progress is counted over the checklist's current
 * items only, the same way OnboardingChecklist counts it, so a renamed item id
 * left behind in a stored value can never push the count past the total. */
export function aggregateOnboardingProgress(
  operators: readonly string[],
  states: readonly { user_email: string; value: unknown; updated_at: string }[],
  itemIds: readonly string[]
): OnboardingProgressRow[] {
  const byEmail = new Map(states.map((state) => [state.user_email, state]));

  return operators
    .map((email) => {
      const state = byEmail.get(email);
      // Written by the operator's own browser, so it is validated here like
      // anywhere else a stored value is read (lib/user-state/merge.ts).
      const parsed = state ? onboardingStateSchema.safeParse(state.value) : null;
      if (!parsed?.success) return { email, completed: 0, total: itemIds.length, updatedAtIso: null };
      return {
        email,
        completed: itemIds.filter((id) => parsed.data[id] === true).length,
        total: itemIds.length,
        updatedAtIso: state?.updated_at ?? null,
      };
    })
    .sort((a, b) => a.completed - b.completed || a.email.localeCompare(b.email));
}

/** Admin-only read: the "user_state_manager_select_all" policy in
 * 0009_user_state.sql (admin-only since 0020) is what lets the admin's own
 * session see every row, the same way the people lookup reads allowed_users
 * under 0005. Operators and sales managers both work through the checklist, so
 * both are listed. The caller has already checked the role — a session without
 * it simply gets nothing back.
 *
 * A failed read of either table is { ok: false } (logged here), never a list
 * of people at 0 of N: the people directory shows no progress chip then,
 * rather than a row of zeros that reads as "nobody has started". */
export async function fetchOnboardingProgress(
  operatorEmail: string | null
): Promise<WidgetData<OnboardingProgressRow[]>> {
  const supabase = createClient();

  const [operatorsResult, statesResult] = await Promise.all([
    supabase.from("allowed_users").select("email").in("role", TRACKED_ROLES).order("email"),
    supabase.from("user_state").select("user_email, value, updated_at").eq("key", ONBOARDING_KEY),
  ]);

  const failed = operatorsResult.error ?? statesResult.error;
  if (failed) {
    console.error("[dashboard] onboarding progress failed:", failed.code ?? "", failed.message);
    return { ok: false };
  }

  const operators = (operatorsResult.data ?? [])
    .map((row) => row.email)
    .filter((email) => !operatorEmail || email === operatorEmail);

  return {
    ok: true,
    data: aggregateOnboardingProgress(
      operators,
      statesResult.data ?? [],
      onboardingSummaryChecklist.map((item) => item.id)
    ),
  };
}
