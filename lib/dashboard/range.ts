import "server-only";
import { todayInTashkent, tashkentDayRangeUTC, isValidDateString } from "@/lib/telemetry/aggregate";

/** Longest span a manager can query in one go — keeps the dashboard
 * functions' scans (the range + the equal-length previous range the KPI deltas
 * compare against, see previousEqualRange) bounded to two 93-day windows.
 * Telemetry is kept 180 days (run_retention, 0016), so at the very longest
 * range the previous window's oldest days may already be pruned. */
export const MAX_RANGE_SPAN_DAYS = 92;

export interface DashboardRange {
  from: string;
  to: string;
  operatorEmail: string | null;
}

export interface RangeWindow {
  startUTC: string;
  endUTC: string;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00.000Z`).getTime();
  const b = new Date(`${to}T00:00:00.000Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function singleParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Days a range-picking page shows when its URL names no range. */
export const DEFAULT_RANGE_DAYS = 7;

/** The monitoring pages' default (/admin, /admin/knowledge, /admin/system):
 * two weeks, the window the people directory's cards cover
 * (DIRECTORY_WINDOW_DAYS in lib/admin/directory.ts), so the overview's team
 * sparklines and the directory's show the same days. */
export const MONITORING_RANGE_DAYS = 14;

/** URL is the source of truth for a monitoring page's range + person filter —
 * every page parses the same three GET params (?from&to&op) the same way, so
 * following a link between them or reloading never loses the admin's
 * selection. Invalid or missing values fall back to "the last `defaultDays`
 * days including today" (DEFAULT_RANGE_DAYS unless the page says otherwise),
 * clamped to MAX_RANGE_SPAN_DAYS. */
export function parseDashboardRange(
  searchParams: Record<string, string | string[] | undefined>,
  { defaultDays = DEFAULT_RANGE_DAYS }: { defaultDays?: number } = {}
): DashboardRange {
  const rawFrom = singleParam(searchParams.from);
  const rawTo = singleParam(searchParams.to);
  const rawOp = singleParam(searchParams.op);

  const today = todayInTashkent();
  const to = isValidDateString(rawTo) && rawTo <= today ? rawTo : today;
  let from = isValidDateString(rawFrom) ? rawFrom : addDays(to, -(Math.max(1, Math.trunc(defaultDays)) - 1));
  if (from > to) from = to;
  if (daysBetween(from, to) > MAX_RANGE_SPAN_DAYS) from = addDays(to, -MAX_RANGE_SPAN_DAYS);

  return { from, to, operatorEmail: rawOp && rawOp.trim() !== "" ? rawOp : null };
}

export function dashboardRangeWindow(range: DashboardRange): RangeWindow {
  const { startUTC } = tashkentDayRangeUTC(range.from);
  const { endUTC } = tashkentDayRangeUTC(range.to);
  return { startUTC, endUTC };
}

/** The equal-length period immediately before `range`, for the KPI cards'
 * delta — e.g. "7 kun" (Mon–Sun) compares against the 7 days before that. */
export function previousEqualRange(range: DashboardRange): DashboardRange {
  const spanDays = daysBetween(range.from, range.to) + 1;
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(spanDays - 1));
  return { from: prevFrom, to: prevTo, operatorEmail: range.operatorEmail };
}

/** The last `days` Tashkent calendar days, today included — [today − (days−1),
 * today], both ends inclusive, the shape parseDashboardRange returns. `today`
 * is a parameter only so a test can pin it. */
export function lastDaysRange(days: number, today: string = todayInTashkent()): Pick<DashboardRange, "from" | "to"> {
  if (!Number.isInteger(days) || days < 1 || days > MAX_RANGE_SPAN_DAYS + 1) {
    throw new RangeError(`lastDaysRange: days must be 1-${MAX_RANGE_SPAN_DAYS + 1}, got ${days}`);
  }
  return { from: addDays(today, -(days - 1)), to: today };
}

/** Number of calendar days a range covers, both ends inclusive. */
export function rangeDayCount(range: Pick<DashboardRange, "from" | "to">): number {
  return daysBetween(range.from, range.to) + 1;
}

/** The windows RangePicker offers, in days — one vocabulary on every admin page
 * that has a range (the overview, knowledge quality, the technical page, a
 * person's page). */
export const RANGE_PRESET_DAYS = [7, 14, 30] as const;

export interface RangePreset {
  /** Also the `dashboard.ranges.<key>` message key of the pill's label. */
  key: `${(typeof RANGE_PRESET_DAYS)[number]}d`;
  from: string;
  to: string;
}

/** `today` is a parameter only so a test can pin it. */
export function buildRangePresets(today: string = todayInTashkent()): RangePreset[] {
  return RANGE_PRESET_DAYS.map((days) => ({ key: `${days}d`, ...lastDaysRange(days, today) }));
}

/**
 * The query that carries `range` (and its person filter) to another page whose
 * own default window is `defaultDays` long: `from`/`to` only when the range is
 * not that default, `op` only when set — so a link from a page left on its
 * default stays clean, and one from a page set to 30 days opens the target on
 * the same 30 days. Returned as params, so a caller can add its own before
 * formatting.
 */
export function rangeSearchParams(
  range: DashboardRange,
  defaultDays: number,
  today: string = todayInTashkent()
): URLSearchParams {
  const params = new URLSearchParams();
  const fallback = lastDaysRange(defaultDays, today);
  if (range.from !== fallback.from || range.to !== fallback.to) {
    params.set("from", range.from);
    params.set("to", range.to);
  }
  if (range.operatorEmail) params.set("op", range.operatorEmail);
  return params;
}

/** `path` with `params` and an optional `#hash`: "/admin/knowledge?from=…#gaps". */
export function withSearch(path: string, params: URLSearchParams, hash?: string): string {
  const query = params.toString();
  return `${path}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}
