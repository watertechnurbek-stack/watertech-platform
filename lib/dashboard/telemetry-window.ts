import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContentBundleOrEmpty } from "@/lib/content/loader";
import {
  buildEntityLabelMaps,
  TOTAL_ONBOARDING_ITEMS,
  type OperatorSummary,
  type WebVitalSummary,
} from "@/lib/telemetry/aggregate";
import { buildDashboardKpis, type DashboardKpiTotals, type DashboardKpis } from "@/lib/dashboard/kpi";
import { getContentHealth } from "@/lib/dashboard/content-health";
import {
  MOST_VIEWED_LIMIT,
  type MostViewedItem,
  type NotHelpfulGroup,
  type ZeroResultQueryGroup,
} from "@/lib/dashboard/quality";
import { dashboardRangeWindow, previousEqualRange, type DashboardRange } from "@/lib/dashboard/range";
import {
  toHourly,
  toKpiTotals,
  toMostViewed,
  toNotHelpful,
  toOperatorSummaries,
  toWebVitals,
  toZeroResultSearches,
} from "@/lib/dashboard/telemetry-rpc";

// Every monitoring number comes from a 0016 function called with the admin's
// own session (RLS-scoped, SECURITY INVOKER) — no raw telemetry row leaves the
// database, so no PostgREST max-rows cap can cut an aggregate short. The calls
// of one page run in parallel.

/** One widget's data, or the fact that it could not be loaded. A failure
 * carries nothing on purpose: the database error is logged here and never
 * rendered, and the page shows an explicit error state in the widget's place
 * — never an empty chart that reads as "no activity". */
export type WidgetData<T> = { ok: true; data: T } | { ok: false };

/** Ranked-list lengths. Each is sent as p_limit, so no response can approach
 * PostgREST's max-rows; ranking happens in SQL before the cut. */
const ZERO_RESULT_LIMIT = 100;
const NOT_HELPFUL_LIMIT = 100;

export interface RpcResult<Row> {
  data: Row[] | null;
  error: { message: string; code?: string } | null;
}

export function toWidget<Row, T>(fn: string, result: RpcResult<Row>, map: (rows: Row[]) => T): WidgetData<T> {
  if (result.error || !result.data) {
    console.error(`[dashboard] ${fn} failed:`, result.error?.code ?? "", result.error?.message ?? "no data");
    return { ok: false };
  }
  try {
    return { ok: true, data: map(result.data) };
  } catch (error) {
    console.error(`[dashboard] ${fn} returned rows of an unexpected shape:`, error instanceof Error ? error.message : String(error));
    return { ok: false };
  }
}

interface RpcFilter {
  p_from: string;
  p_to: string;
  p_operator?: string;
}

/** The selected Tashkent-day range as UTC instants, plus the operator filter
 * (left out for "all operators" — the SQL default). */
function rpcFilter(range: DashboardRange): RpcFilter {
  const { startUTC, endUTC } = dashboardRangeWindow(range);
  const filter: RpcFilter = { p_from: startUTC, p_to: endUTC };
  if (range.operatorEmail) filter.p_operator = range.operatorEmail;
  return filter;
}

/** A read that reports failure by throwing (a cached loader, a query helper)
 * as a widget: the error is logged under `label` and becomes { ok: false }, so
 * one failing source costs its widget, never the page. */
export async function settleWidget<T>(label: string, read: () => Promise<T>): Promise<WidgetData<T>> {
  try {
    return { ok: true, data: await read() };
  } catch (error) {
    console.error(`[dashboard] ${label} failed:`, error instanceof Error ? error.message : String(error));
    return { ok: false };
  }
}

// One call per list (the monitoring pages, S03): each list is its own widget
// and fails on its own, where fetchActivityTelemetry / fetchQualityTelemetry
// read several lists for the retired tabs in one go.

/** dashboard_kpis' telemetry totals for the range and the equal-length range
 * before it — exact counts, not sums of a capped list. */
export async function fetchKpiTotals(range: DashboardRange): Promise<WidgetData<DashboardKpiTotals>> {
  const { startUTC: previousStartUTC } = dashboardRangeWindow(previousEqualRange(range));
  const result = await createClient().rpc("dashboard_kpis", { ...rpcFilter(range), p_prev_from: previousStartUTC });
  return toWidget("dashboard_kpis", result, (rows) => {
    const [row] = rows;
    if (!row) throw new Error("no row");
    return toKpiTotals(row);
  });
}

/** Searches that found nothing, most frequent first; the person filter applies. */
export async function fetchZeroResultSearches(
  range: DashboardRange,
  limit: number = ZERO_RESULT_LIMIT
): Promise<WidgetData<ZeroResultQueryGroup[]>> {
  const result = await createClient().rpc("dashboard_zero_result_searches", { ...rpcFilter(range), p_limit: limit });
  return toWidget("dashboard_zero_result_searches", result, toZeroResultSearches);
}

/** Pages marked "not helpful", most marks first; the person filter applies. */
export async function fetchNotHelpful(
  range: DashboardRange,
  limit: number = NOT_HELPFUL_LIMIT
): Promise<WidgetData<NotHelpfulGroup[]>> {
  const result = await createClient().rpc("dashboard_not_helpful", { ...rpcFilter(range), p_limit: limit });
  return toWidget("dashboard_not_helpful", result, toNotHelpful);
}

/** p50 / p75 per Web Vitals metric over the range (the technical page). */
export async function fetchWebVitals(range: DashboardRange): Promise<WidgetData<WebVitalSummary[]>> {
  const result = await createClient().rpc("dashboard_web_vitals", rpcFilter(range));
  return toWidget("dashboard_web_vitals", result, toWebVitals);
}

/** The retired tabs' KPI cards. The draft count is not telemetry: it comes
 * from the content-health cache, and a failure there still throws to the
 * route's error boundary, as before. */
export async function fetchDashboardKpis(range: DashboardRange): Promise<WidgetData<DashboardKpis>> {
  const supabase = createClient();
  const { startUTC: previousStartUTC } = dashboardRangeWindow(previousEqualRange(range));

  const [result, health] = await Promise.all([
    supabase.rpc("dashboard_kpis", { ...rpcFilter(range), p_prev_from: previousStartUTC }),
    getContentHealth(),
  ]);

  return toWidget("dashboard_kpis", result, (rows) => {
    const [row] = rows;
    if (!row) throw new Error("no row");
    return buildDashboardKpis(toKpiTotals(row), health.draftsTotal);
  });
}

export interface ActivityTelemetry {
  operators: WidgetData<OperatorSummary[]>;
  hourly: WidgetData<number[]>;
  zeroResultSearches: WidgetData<ZeroResultQueryGroup[]>;
  webVitals: WidgetData<WebVitalSummary[]>;
}

/** The retired Faollik tab's four lists — each can fail on its own. The
 * monitoring pages call fetchZeroResultSearches / fetchWebVitals directly. */
export async function fetchActivityTelemetry(range: DashboardRange): Promise<ActivityTelemetry> {
  const supabase = createClient();
  const filter = rpcFilter(range);

  const [operators, hourly, zeroResultSearches, webVitals, labelMaps] = await Promise.all([
    supabase.rpc("dashboard_operator_activity", filter),
    supabase.rpc("dashboard_hourly", filter),
    supabase.rpc("dashboard_zero_result_searches", { ...filter, p_limit: ZERO_RESULT_LIMIT }),
    supabase.rpc("dashboard_web_vitals", filter),
    // "degrade" mode: this only resolves ids to human labels on a
    // request-time manager render. Unreadable content costs the cards their
    // labels, never the telemetry numbers themselves.
    getContentBundleOrEmpty().then(buildEntityLabelMaps),
  ]);

  return {
    operators: toWidget("dashboard_operator_activity", operators, (rows) =>
      toOperatorSummaries(rows, TOTAL_ONBOARDING_ITEMS, labelMaps)
    ),
    hourly: toWidget("dashboard_hourly", hourly, toHourly),
    zeroResultSearches: toWidget("dashboard_zero_result_searches", zeroResultSearches, toZeroResultSearches),
    webVitals: toWidget("dashboard_web_vitals", webVitals, toWebVitals),
  };
}

export interface QualityTelemetry {
  notHelpful: NotHelpfulGroup[];
  zeroResultQueries: ZeroResultQueryGroup[];
  mostViewed: MostViewedItem[];
}

/** The retired Sifat tab's three lists as one widget: one failing call fails
 * all three. The monitoring pages call fetchNotHelpful /
 * fetchZeroResultSearches one by one instead, so each list fails alone. */
export async function fetchQualityTelemetry(range: DashboardRange): Promise<WidgetData<QualityTelemetry>> {
  const supabase = createClient();
  const filter = rpcFilter(range);

  const [notHelpfulResult, zeroResultResult, mostViewedResult, labelMaps] = await Promise.all([
    supabase.rpc("dashboard_not_helpful", { ...filter, p_limit: NOT_HELPFUL_LIMIT }),
    supabase.rpc("dashboard_zero_result_searches", { ...filter, p_limit: ZERO_RESULT_LIMIT }),
    supabase.rpc("dashboard_most_viewed", { ...filter, p_limit: MOST_VIEWED_LIMIT }),
    getContentBundleOrEmpty().then(buildEntityLabelMaps),
  ]);

  const notHelpful = toWidget("dashboard_not_helpful", notHelpfulResult, toNotHelpful);
  const zeroResultQueries = toWidget("dashboard_zero_result_searches", zeroResultResult, toZeroResultSearches);
  const mostViewed = toWidget("dashboard_most_viewed", mostViewedResult, (rows) => toMostViewed(rows, labelMaps));

  if (!notHelpful.ok || !zeroResultQueries.ok || !mostViewed.ok) return { ok: false };
  return {
    ok: true,
    data: { notHelpful: notHelpful.data, zeroResultQueries: zeroResultQueries.data, mostViewed: mostViewed.data },
  };
}
