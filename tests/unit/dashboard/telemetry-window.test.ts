import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardRange } from "@/lib/dashboard/range";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/server", () => ({ createClient: () => ({ rpc }) }));
vi.mock("@/lib/content/loader", () => ({
  getContentBundleOrEmpty: async () => ({ scripts: [], objections: [], faqs: [], competitors: [], packageGroups: [] }),
}));
vi.mock("@/lib/dashboard/content-health", () => ({
  getContentHealth: async () => ({ drafts: [], draftsTotal: 4, stale: [], staleTotal: 0, missingRu: [], missingRuTotal: 0 }),
}));

import {
  fetchActivityTelemetry,
  fetchDashboardKpis,
  fetchKpiTotals,
  fetchNotHelpful,
  fetchQualityTelemetry,
  fetchWebVitals,
  fetchZeroResultSearches,
  settleWidget,
} from "@/lib/dashboard/telemetry-window";

const RANGE: DashboardRange = { from: "2026-09-14", to: "2026-09-20", operatorEmail: null };
// Tashkent midnight is 19:00 UTC the day before; the previous 7-day range starts 2026-09-07.
const WINDOW = { p_from: "2026-09-13T19:00:00.000Z", p_to: "2026-09-20T19:00:00.000Z" };
const PREVIOUS_START = "2026-09-06T19:00:00.000Z";

const OPERATOR_ROW = {
  operator_email: "op@watertech.uz",
  active_ms: 1000,
  copy_count: 1,
  checklist_completed: 0,
  top_viewed: [{ view_type: "faq_view", entity_id: "Narxi?", path: "/faq", view_count: 2 }],
};

const ROWS: Record<string, unknown[]> = {
  dashboard_kpis: [
    { active_operators: 2, active_operators_prev: 1, active_ms: 1000, active_ms_prev: 500, zero_result_searches: 3, zero_result_searches_prev: 0 },
  ],
  dashboard_operator_activity: [OPERATOR_ROW],
  dashboard_hourly: Array.from({ length: 24 }, (_, hour) => ({ hour_of_day: hour, event_count: hour === 9 ? 5 : 0 })),
  dashboard_zero_result_searches: [{ search_query: "kafolat", search_count: 2, last_seen_at: "2026-09-20T08:00:00+00:00" }],
  dashboard_web_vitals: [{ metric_name: "LCP", p50: 1800, p75: 2400, samples: 3 }],
  dashboard_not_helpful: [{ page_path: "/faq", feedback_count: 1 }],
  dashboard_most_viewed: [{ view_type: "objection_view", view_entity_id: "obj-qimmat", view_path: "/sales-process/objections", view_count: 4 }],
};

/** Every function answers with ROWS unless named in `failing` (a PostgREST
 * error) or given other rows in `overrides`. */
function respond(failing: string[] = [], overrides: Record<string, unknown[]> = {}): void {
  rpc.mockImplementation(async (fn: string) =>
    failing.includes(fn)
      ? { data: null, error: { message: "permission denied for table telemetry_events", code: "42501" } }
      : { data: overrides[fn] ?? ROWS[fn], error: null }
  );
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rpc.mockReset();
  respond();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("fetchDashboardKpis", () => {
  it("sends the range as UTC instants plus the previous window's start, and no p_operator for all operators", async () => {
    const kpis = await fetchDashboardKpis(RANGE);

    expect(rpc).toHaveBeenCalledWith("dashboard_kpis", { ...WINDOW, p_prev_from: PREVIOUS_START });
    expect(kpis).toEqual({
      ok: true,
      data: {
        activeOperators: { value: 2, deltaPercent: 100 },
        totalActiveMs: { value: 1000, deltaPercent: 100 },
        draftCount: { value: 4, deltaPercent: null },
        zeroResultSearches: { value: 3, deltaPercent: null },
      },
    });
  });

  it("is an error state when the call fails or returns no row", async () => {
    respond(["dashboard_kpis"]);
    expect(await fetchDashboardKpis(RANGE)).toEqual({ ok: false });

    respond([], { dashboard_kpis: [] });
    expect(await fetchDashboardKpis(RANGE)).toEqual({ ok: false });
  });
});

describe("fetchActivityTelemetry", () => {
  it("passes the operator filter and the list limit", async () => {
    await fetchActivityTelemetry({ ...RANGE, operatorEmail: "op@watertech.uz" });

    const filter = { ...WINDOW, p_operator: "op@watertech.uz" };
    expect(rpc).toHaveBeenCalledWith("dashboard_operator_activity", filter);
    expect(rpc).toHaveBeenCalledWith("dashboard_hourly", filter);
    expect(rpc).toHaveBeenCalledWith("dashboard_zero_result_searches", { ...filter, p_limit: 100 });
    expect(rpc).toHaveBeenCalledWith("dashboard_web_vitals", filter);
  });

  it("maps every section into the shape its table renders", async () => {
    const activity = await fetchActivityTelemetry(RANGE);

    expect(activity.operators).toEqual({
      ok: true,
      data: [
        {
          email: "op@watertech.uz",
          activeMs: 1000,
          topViewed: [{ label: "Narxi?", count: 2, adminHref: null }],
          copyCount: 1,
          checklistCompleted: 0,
          checklistTotal: expect.any(Number),
          checklistPercent: 0,
        },
      ],
    });
    expect(activity.hourly.ok && activity.hourly.data[9]).toBe(5);
    expect(activity.zeroResultSearches).toEqual({
      ok: true,
      data: [{ query: "kafolat", count: 2, lastSeenIso: "2026-09-20T08:00:00.000Z" }],
    });
    expect(activity.webVitals).toEqual({ ok: true, data: [{ name: "LCP", p50: 1800, p75: 2400, samples: 3 }] });
  });

  it("fails only the section whose call failed, and keeps the database message on the server", async () => {
    respond(["dashboard_hourly"]);
    const activity = await fetchActivityTelemetry(RANGE);

    expect(activity.hourly).toEqual({ ok: false });
    expect(activity.operators.ok && activity.zeroResultSearches.ok && activity.webVitals.ok).toBe(true);
    expect(JSON.stringify(activity)).not.toContain("permission denied");
    expect(consoleError).toHaveBeenCalledWith(
      "[dashboard] dashboard_hourly failed:",
      "42501",
      "permission denied for table telemetry_events"
    );
  });

  it("treats rows of an unexpected shape as an error, not as an empty widget", async () => {
    respond([], {
      dashboard_operator_activity: [{ ...OPERATOR_ROW, top_viewed: [{ view_type: "nope" }] }],
      dashboard_hourly: ROWS.dashboard_hourly.slice(1),
    });
    const activity = await fetchActivityTelemetry(RANGE);

    expect(activity.operators).toEqual({ ok: false });
    expect(activity.hourly).toEqual({ ok: false });
  });
});

describe("fetchQualityTelemetry", () => {
  it("returns the three lists QualityPanel takes", async () => {
    expect(await fetchQualityTelemetry(RANGE)).toEqual({
      ok: true,
      data: {
        notHelpful: [{ path: "/faq", count: 1 }],
        zeroResultQueries: [{ query: "kafolat", count: 2, lastSeenIso: "2026-09-20T08:00:00.000Z" }],
        mostViewed: [{ label: "obj-qimmat", count: 4, adminHref: "/admin/objections/obj-qimmat" }],
      },
    });
    expect(rpc).toHaveBeenCalledWith("dashboard_not_helpful", { ...WINDOW, p_limit: 100 });
    expect(rpc).toHaveBeenCalledWith("dashboard_most_viewed", { ...WINDOW, p_limit: 10 });
  });

  it("puts the whole panel in its error state when any of its calls fails", async () => {
    respond(["dashboard_most_viewed"]);
    expect(await fetchQualityTelemetry(RANGE)).toEqual({ ok: false });
  });
});

// The monitoring pages' one-list-per-call reads (S03): each list is its own
// widget and fails on its own.

describe("fetchKpiTotals", () => {
  it("returns the exact totals of both windows", async () => {
    expect(await fetchKpiTotals(RANGE)).toEqual({
      ok: true,
      data: {
        current: { activeOperators: 2, activeMs: 1000, zeroResultSearches: 3 },
        previous: { activeOperators: 1, activeMs: 500, zeroResultSearches: 0 },
      },
    });
    expect(rpc).toHaveBeenCalledWith("dashboard_kpis", { ...WINDOW, p_prev_from: PREVIOUS_START });
  });

  it("is { ok: false } on an error or no row", async () => {
    respond(["dashboard_kpis"]);
    expect(await fetchKpiTotals(RANGE)).toEqual({ ok: false });
    respond([], { dashboard_kpis: [] });
    expect(await fetchKpiTotals(RANGE)).toEqual({ ok: false });
  });
});

describe("fetchZeroResultSearches / fetchNotHelpful / fetchWebVitals", () => {
  it("call one function each, with the person filter and the limit", async () => {
    const filtered = { ...RANGE, operatorEmail: "op@watertech.uz" };
    expect(await fetchZeroResultSearches(filtered, 1)).toEqual({
      ok: true,
      data: [{ query: "kafolat", count: 2, lastSeenIso: "2026-09-20T08:00:00.000Z" }],
    });
    expect(rpc).toHaveBeenCalledWith("dashboard_zero_result_searches", {
      ...WINDOW,
      p_operator: "op@watertech.uz",
      p_limit: 1,
    });

    expect(await fetchNotHelpful(RANGE)).toEqual({ ok: true, data: [{ path: "/faq", count: 1 }] });
    expect(rpc).toHaveBeenCalledWith("dashboard_not_helpful", { ...WINDOW, p_limit: 100 });

    expect(await fetchWebVitals(RANGE)).toEqual({
      ok: true,
      data: [{ name: "LCP", p50: 1800, p75: 2400, samples: 3 }],
    });
    expect(rpc).toHaveBeenCalledWith("dashboard_web_vitals", WINDOW);
    expect(rpc).toHaveBeenCalledTimes(3);
  });

  it("fail alone", async () => {
    respond(["dashboard_not_helpful"]);
    expect(await fetchNotHelpful(RANGE)).toEqual({ ok: false });
    expect((await fetchZeroResultSearches(RANGE)).ok).toBe(true);
    expect((await fetchWebVitals(RANGE)).ok).toBe(true);
  });
});

describe("settleWidget", () => {
  it("wraps a value, and turns a throw into { ok: false } with a log line", async () => {
    expect(await settleWidget("counts", async () => 3)).toEqual({ ok: true, data: 3 });
    expect(
      await settleWidget("counts", async () => {
        throw new Error("content_faqs: permission denied");
      })
    ).toEqual({ ok: false });
    expect(consoleError).toHaveBeenCalledWith("[dashboard] counts failed:", "content_faqs: permission denied");
  });
});
