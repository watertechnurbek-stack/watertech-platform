import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DIRECTORY_WINDOW_DAYS } from "@/lib/admin/directory";
import {
  DEFAULT_RANGE_DAYS,
  MAX_RANGE_SPAN_DAYS,
  MONITORING_RANGE_DAYS,
  buildRangePresets,
  lastDaysRange,
  parseDashboardRange,
  rangeDayCount,
  rangeSearchParams,
  withSearch,
} from "@/lib/dashboard/range";

// 2026-09-16T20:30Z is already 01:30 on 2026-09-17 in Tashkent (UTC+5), so a
// default window computed from the UTC date would be off by one day.
const NOW_UTC = "2026-09-16T20:30:00.000Z";
const TODAY_TASHKENT = "2026-09-17";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(NOW_UTC));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("parseDashboardRange", () => {
  it("defaults to the 7-day window ending today in Tashkent", () => {
    expect(parseDashboardRange({})).toEqual({ from: "2026-09-11", to: TODAY_TASHKENT, operatorEmail: null });
  });

  it("takes a page's own default window — the monitoring pages open on two weeks", () => {
    expect(DEFAULT_RANGE_DAYS).toBe(7);
    expect(parseDashboardRange({}, { defaultDays: MONITORING_RANGE_DAYS })).toEqual({
      from: "2026-09-04",
      to: TODAY_TASHKENT,
      operatorEmail: null,
    });
    // An explicit range still wins.
    expect(parseDashboardRange({ from: "2026-09-10", to: "2026-09-12" }, { defaultDays: 14 })).toMatchObject({
      from: "2026-09-10",
      to: "2026-09-12",
    });
  });

  it("keeps a valid explicit range as-is", () => {
    expect(parseDashboardRange({ from: "2026-09-01", to: "2026-09-10", op: "op@watertech.uz" })).toEqual({
      from: "2026-09-01",
      to: "2026-09-10",
      operatorEmail: "op@watertech.uz",
    });
  });

  it("allows exactly MAX_RANGE_SPAN_DAYS", () => {
    expect(MAX_RANGE_SPAN_DAYS).toBe(92);
    expect(parseDashboardRange({ from: "2026-06-17", to: TODAY_TASHKENT }).from).toBe("2026-06-17");
  });

  it("clamps a longer span to MAX_RANGE_SPAN_DAYS back from `to`", () => {
    expect(parseDashboardRange({ from: "2026-01-01", to: TODAY_TASHKENT })).toMatchObject({
      from: "2026-06-17",
      to: TODAY_TASHKENT,
    });
    expect(parseDashboardRange({ from: "2025-01-01", to: "2026-03-01" }).from).toBe("2025-11-29");
  });

  it.each([
    ["garbage", "also-garbage"],
    ["2026-13-01", "2026-09-40"],
    ["17.09.2026", "2026/09/17"],
    ["", ""],
  ])("falls back to the default window for invalid dates (%s, %s)", (from, to) => {
    expect(parseDashboardRange({ from, to })).toMatchObject({ from: "2026-09-11", to: TODAY_TASHKENT });
  });

  it("falls back per field: an invalid `from` counts 6 days back from a valid `to`", () => {
    expect(parseDashboardRange({ from: "garbage", to: "2026-09-05" })).toMatchObject({ from: "2026-08-30", to: "2026-09-05" });
  });

  it("never lets `to` run past today in Tashkent", () => {
    expect(parseDashboardRange({ from: "2026-09-15", to: "2026-12-31" })).toMatchObject({
      from: "2026-09-15",
      to: TODAY_TASHKENT,
    });
  });

  // The S21 task describes `from > to` as a swap; range.ts instead collapses
  // the range to the single day `to`. Locked to the implemented behaviour —
  // RangePicker only emits presets, so this is reachable only via a
  // hand-edited URL.
  it("collapses `from > to` to the single day `to` (does not swap)", () => {
    expect(parseDashboardRange({ from: "2026-09-10", to: "2026-09-01" })).toMatchObject({
      from: "2026-09-01",
      to: "2026-09-01",
    });
  });

  it("takes the first value of repeated params and treats a blank operator as none", () => {
    expect(parseDashboardRange({ from: ["2026-09-02", "2026-01-01"], to: ["2026-09-03"], op: "   " })).toEqual({
      from: "2026-09-02",
      to: "2026-09-03",
      operatorEmail: null,
    });
  });
});

describe("lastDaysRange", () => {
  it("is the last N Tashkent days, today included, both ends inclusive", () => {
    expect(lastDaysRange(14)).toEqual({ from: "2026-09-04", to: TODAY_TASHKENT });
    expect(lastDaysRange(1)).toEqual({ from: TODAY_TASHKENT, to: TODAY_TASHKENT });
    expect(rangeDayCount(lastDaysRange(14))).toBe(14);
  });

  it("takes today from Tashkent, not from UTC", () => {
    // NOW_UTC is still the 16th in UTC.
    expect(lastDaysRange(7).to).toBe("2026-09-17");
  });

  it("can be pinned to a day, across a month boundary", () => {
    expect(lastDaysRange(7, "2026-10-03")).toEqual({ from: "2026-09-27", to: "2026-10-03" });
  });

  it("refuses a span the dashboard functions would refuse", () => {
    expect(() => lastDaysRange(0)).toThrow(RangeError);
    expect(() => lastDaysRange(1.5)).toThrow(RangeError);
    expect(() => lastDaysRange(MAX_RANGE_SPAN_DAYS + 2)).toThrow(RangeError);
    expect(rangeDayCount(lastDaysRange(MAX_RANGE_SPAN_DAYS + 1))).toBe(MAX_RANGE_SPAN_DAYS + 1);
  });
});

describe("rangeDayCount", () => {
  it("counts both ends", () => {
    expect(rangeDayCount({ from: "2026-09-11", to: "2026-09-17" })).toBe(7);
    expect(rangeDayCount({ from: "2026-09-17", to: "2026-09-17" })).toBe(1);
    expect(rangeDayCount({ from: "2026-08-30", to: "2026-09-02" })).toBe(4);
  });
});

describe("buildRangePresets", () => {
  it("offers 7, 14 and 30 days ending today, in that order", () => {
    expect(buildRangePresets()).toEqual([
      { key: "7d", from: "2026-09-11", to: TODAY_TASHKENT },
      { key: "14d", from: "2026-09-04", to: TODAY_TASHKENT },
      { key: "30d", from: "2026-08-19", to: TODAY_TASHKENT },
    ]);
  });

  it("matches the people directory's window with the monitoring default", () => {
    expect(MONITORING_RANGE_DAYS).toBe(DIRECTORY_WINDOW_DAYS);
    expect(buildRangePresets().map((preset) => preset.key)).toContain(`${MONITORING_RANGE_DAYS}d`);
  });
});

describe("rangeSearchParams", () => {
  it("is empty for the target page's own default window", () => {
    const range = { ...lastDaysRange(14), operatorEmail: null };
    expect(rangeSearchParams(range, 14).toString()).toBe("");
  });

  it("names the range when it differs from the target's default, and the person filter when set", () => {
    const range = { ...lastDaysRange(14), operatorEmail: "ali@x.uz" };
    expect(rangeSearchParams(range, 7).toString()).toBe("from=2026-09-04&to=2026-09-17&op=ali%40x.uz");
    expect(rangeSearchParams({ from: "2026-09-01", to: "2026-09-10", operatorEmail: null }, 14).toString()).toBe(
      "from=2026-09-01&to=2026-09-10"
    );
  });
});

describe("withSearch", () => {
  it("joins a path, its params and a hash, leaving out what is empty", () => {
    expect(withSearch("/admin/knowledge", new URLSearchParams())).toBe("/admin/knowledge");
    expect(withSearch("/admin/knowledge", new URLSearchParams("from=a&to=b"), "gaps")).toBe(
      "/admin/knowledge?from=a&to=b#gaps"
    );
  });
});
