import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getContentBundleOrEmpty } from "@/lib/content/loader";
import { buildEntityLabelMaps, resolveAdminHref, resolveEntityLabel } from "@/lib/telemetry/aggregate";
import { toWidget, type WidgetData } from "@/lib/dashboard/telemetry-window";
import { toHourly, toMostViewed, toZeroResultSearches } from "@/lib/dashboard/telemetry-rpc";
import { dashboardRangeWindow, previousEqualRange, type DashboardRange } from "@/lib/dashboard/range";
import type { MostViewedItem, ZeroResultQueryGroup } from "@/lib/dashboard/quality";
import { isUserRole, userEmailSchema } from "@/lib/admin/users";
import {
  toPersonDays,
  toPersonEvents,
  toPersonOverviews,
  toPersonSections,
  toPersonSummary,
  toTopContent,
  type PersonDay,
  type PersonEvent,
  type PersonOverview,
  type PersonRecord,
  type PersonSection,
  type PersonSummary,
  type TopContentItem,
} from "@/lib/admin/people";
import { buildTimeline, type TimelineEntry } from "@/lib/admin/person-page";

// The people directory's and person page's reads (R3/S02). Every number comes
// from a 0021 function called with the admin's own session — the RLS-scoped
// client, SECURITY INVOKER functions — so no raw telemetry row leaves the
// database (CLAUDE.md §9). Each call is its own widget: a failure is logged
// and returned as { ok: false }, and the page renders that widget's error
// state (CLAUDE.md §15). The calls of one page are independent, so a page runs
// them in parallel.

/** A Tashkent-date range, YYYY-MM-DD, both ends inclusive — what
 * parseDashboardRange (lib/dashboard/range.ts) reads from the URL. */
export type PeopleRange = Pick<DashboardRange, "from" | "to">;

/** Sent as p_limit (the SQL functions accept 1-100). */
export const RECENT_EVENTS_LIMIT = 30;
export const TOP_CONTENT_LIMIT = 10;
/** The person page's most-viewed and zero-result lists (dashboard_most_viewed
 * takes 1-1000, dashboard_zero_result_searches 1-1000). */
export const PERSON_MOST_VIEWED_LIMIT = 10;
export const PERSON_ZERO_RESULT_LIMIT = 20;

function asDashboardRange(range: PeopleRange): DashboardRange {
  return { from: range.from, to: range.to, operatorEmail: null };
}

/** The range as the UTC instants [p_from, p_to) the functions take. */
function rpcWindow(range: PeopleRange): { p_from: string; p_to: string } {
  const { startUTC, endUTC } = dashboardRangeWindow(asDashboardRange(range));
  return { p_from: startUTC, p_to: endUTC };
}

export async function fetchPeopleOverview(range: PeopleRange): Promise<WidgetData<PersonOverview[]>> {
  const supabase = createClient();
  const result = await supabase.rpc("admin_people_overview", rpcWindow(range));
  return toWidget("admin_people_overview", result, toPersonOverviews);
}

/** The range and the equal-length range right before it, for the deltas. */
export async function fetchPersonSummary(email: string, range: PeopleRange): Promise<WidgetData<PersonSummary>> {
  const supabase = createClient();
  const { startUTC: previousStartUTC } = dashboardRangeWindow(previousEqualRange(asDashboardRange(range)));
  const result = await supabase.rpc("admin_person_summary", {
    p_email: email,
    ...rpcWindow(range),
    p_prev_from: previousStartUTC,
  });
  return toWidget("admin_person_summary", result, toPersonSummary);
}

export async function fetchPersonDaily(email: string, range: PeopleRange): Promise<WidgetData<PersonDay[]>> {
  const supabase = createClient();
  const result = await supabase.rpc("admin_person_daily", { p_email: email, ...rpcWindow(range) });
  return toWidget("admin_person_daily", result, toPersonDays);
}

export async function fetchPersonSections(email: string, range: PeopleRange): Promise<WidgetData<PersonSection[]>> {
  const supabase = createClient();
  const result = await supabase.rpc("admin_person_sections", { p_email: email, ...rpcWindow(range) });
  return toWidget("admin_person_sections", result, toPersonSections);
}

/** Newest first, over all retained telemetry — not range-scoped. */
export async function fetchPersonRecentEvents(
  email: string,
  limit: number = RECENT_EVENTS_LIMIT
): Promise<WidgetData<PersonEvent[]>> {
  const supabase = createClient();
  const result = await supabase.rpc("admin_person_recent_events", { p_email: email, p_limit: limit });
  return toWidget("admin_person_recent_events", result, toPersonEvents);
}

/** Labels and admin links are resolved here, from the content bundle, the way
 * the dashboard's "most viewed" list does it (lib/dashboard/telemetry-rpc.ts). */
export async function fetchTopContent(
  range: PeopleRange,
  limit: number = TOP_CONTENT_LIMIT
): Promise<WidgetData<TopContentItem[]>> {
  const supabase = createClient();
  const [result, maps] = await Promise.all([
    supabase.rpc("admin_top_content", { ...rpcWindow(range), p_limit: limit }),
    // "degrade" mode: unreadable content costs the list its labels (the raw
    // id or path shows instead), never the numbers.
    getContentBundleOrEmpty().then(buildEntityLabelMaps),
  ]);
  return toWidget("admin_top_content", result, (rows) =>
    toTopContent(rows, (viewType, entityId, path) => ({
      label: resolveEntityLabel(viewType, entityId, path, maps),
      adminHref: resolveAdminHref(viewType, entityId),
    }))
  );
}

/** Newest events, humanized (lib/admin/person-page.ts): each line is a message
 * key and its values, with content ids already turned into titles. */
export async function fetchPersonTimeline(
  email: string,
  limit: number = RECENT_EVENTS_LIMIT
): Promise<WidgetData<TimelineEntry[]>> {
  const supabase = createClient();
  const [result, maps] = await Promise.all([
    supabase.rpc("admin_person_recent_events", { p_email: email, p_limit: limit }),
    // "degrade" mode, as in fetchTopContent: no content costs the lines
    // their titles, never the timeline.
    getContentBundleOrEmpty().then(buildEntityLabelMaps),
  ]);
  return toWidget("admin_person_recent_events", result, (rows) => buildTimeline(toPersonEvents(rows), maps));
}

// One person's slices of the 0016 dashboard functions — the same functions the
// monitoring pages call, filtered with p_operator (S02: "not new").

/** Events per Tashkent hour of the day (index = hour), over the range. */
export async function fetchPersonHourly(email: string, range: PeopleRange): Promise<WidgetData<number[]>> {
  const supabase = createClient();
  const result = await supabase.rpc("dashboard_hourly", { ...rpcWindow(range), p_operator: email });
  return toWidget("dashboard_hourly", result, toHourly);
}

/** The person's most viewed script stages, objections and FAQs, labelled and linked. */
export async function fetchPersonMostViewed(
  email: string,
  range: PeopleRange,
  limit: number = PERSON_MOST_VIEWED_LIMIT
): Promise<WidgetData<MostViewedItem[]>> {
  const supabase = createClient();
  const [result, maps] = await Promise.all([
    supabase.rpc("dashboard_most_viewed", { ...rpcWindow(range), p_operator: email, p_limit: limit }),
    getContentBundleOrEmpty().then(buildEntityLabelMaps),
  ]);
  return toWidget("dashboard_most_viewed", result, (rows) => toMostViewed(rows, maps));
}

/** Searches by this person that found nothing, most frequent first. */
export async function fetchPersonZeroSearches(
  email: string,
  range: PeopleRange,
  limit: number = PERSON_ZERO_RESULT_LIMIT
): Promise<WidgetData<ZeroResultQueryGroup[]>> {
  const supabase = createClient();
  const result = await supabase.rpc("dashboard_zero_result_searches", {
    ...rpcWindow(range),
    p_operator: email,
    p_limit: limit,
  });
  return toWidget("dashboard_zero_result_searches", result, toZeroResultSearches);
}

/** Every allow-list row, lightly: the lookup that says whether an email in a
 * list (the dashboard's activity rows, the activity feed) is a person with a
 * page of their own, and under what name. A failed read is { ok: false } — the
 * list then shows plain emails, never no list. */
export async function fetchPeopleLookup(): Promise<WidgetData<PersonRecord[]>> {
  const { data, error } = await createClient()
    .from("allowed_users")
    .select("email,full_name,role,is_active,created_at")
    .order("email");
  if (error) {
    console.error("[admin] allowed_users lookup failed:", error.code ?? "", error.message);
    return { ok: false };
  }

  const people: PersonRecord[] = [];
  for (const row of data) {
    // Cannot happen since 0020 validated allowed_users_role_chk; skipped, not rendered.
    if (!isUserRole(row.role)) continue;
    people.push({
      email: row.email,
      fullName: row.full_name,
      role: row.role,
      isActive: row.is_active,
      addedAt: new Date(row.created_at).toISOString(),
    });
  }
  return { ok: true, data: people };
}

/** The allow-list row for /admin/users/[email]: null means "not on the
 * allow-list" (→ notFound()). A read error throws to the route's error
 * boundary instead — an outage must not look like a missing person. */
export async function getPersonRecord(email: string): Promise<PersonRecord | null> {
  const parsed = userEmailSchema.safeParse(email);
  if (!parsed.success) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("allowed_users")
    .select("email,full_name,role,is_active,created_at")
    .eq("email", parsed.data)
    .maybeSingle();
  if (error) throw new Error(`allowed_users: ${error.message}`);
  if (!data) return null;

  // Cannot happen since 0020 validated allowed_users_role_chk; logged, not
  // rendered, like listAdminUsers does.
  if (!isUserRole(data.role)) {
    console.error("[admin] allowed_users row with an unknown role");
    return null;
  }

  return {
    email: data.email,
    fullName: data.full_name,
    role: data.role,
    isActive: data.is_active,
    addedAt: new Date(data.created_at).toISOString(),
  };
}
