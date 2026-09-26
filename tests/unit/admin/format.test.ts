import { describe, expect, it } from "vitest";
import { formatDate, formatRelative, formatStableDateTime, type RelativeTimeTranslator } from "@/lib/admin/format";

const t: RelativeTimeTranslator = (key, values) => (values ? `${key}:${values.count}` : key);
const NOW = Date.parse("2026-09-24T12:00:00.000Z");
const ago = (ms: number): string => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRelative", () => {
  it("measures against the clock it is given, not the system's", () => {
    expect(formatRelative(ago(20_000), t, "uz", NOW)).toBe("now");
    expect(formatRelative(ago(5 * MIN), t, "uz", NOW)).toBe("minutes:5");
    expect(formatRelative(ago(3 * HOUR), t, "uz", NOW)).toBe("hours:3");
    expect(formatRelative(ago(2 * DAY), t, "uz", NOW)).toBe("days:2");
  });

  it("uses the same rounding at every boundary", () => {
    expect(formatRelative(ago(59 * MIN), t, "uz", NOW)).toBe("minutes:59");
    expect(formatRelative(ago(60 * MIN), t, "uz", NOW)).toBe("hours:1");
    expect(formatRelative(ago(29 * DAY), t, "uz", NOW)).toBe("days:29");
  });

  it("falls back to a plain date after 30 days", () => {
    expect(formatRelative(ago(45 * DAY), t, "uz", NOW)).toMatch(/\d/);
    expect(formatRelative(ago(45 * DAY), t, "uz", NOW)).not.toContain("days:");
  });

  it("falls back to the office's Tashkent calendar date, not the server's local date", () => {
    // 21:00 UTC is already 02:00 the next day in Tashkent (UTC+5, no DST) — a
    // server running in UTC (CI, most hosts) would print the wrong day here if
    // the fallback ever dropped Asia/Tashkent, the timezone every other date
    // in this file (formatDate, formatDateTime, formatStableDateTime) uses.
    const iso = "2026-08-10T21:00:00.000Z";
    expect(formatRelative(iso, t, "uz", NOW)).toBe(formatDate(iso, "uz"));
    expect(formatRelative(iso, t, "ru", NOW)).toBe(formatDate(iso, "ru"));
  });

  it("still reads the system clock when none is given", () => {
    expect(formatRelative(new Date().toISOString(), t, "uz")).toBe("now");
  });
});

describe("formatStableDateTime", () => {
  it("prints the Tashkent wall clock (UTC+5) without Intl", () => {
    expect(formatStableDateTime("2026-09-24T08:05:00.000Z")).toBe("2026-09-24 13:05");
  });

  it("crosses midnight into the next Tashkent day", () => {
    expect(formatStableDateTime("2026-09-16T20:30:00.000Z")).toBe("2026-09-17 01:30");
  });

  it("accepts PostgREST's +00:00 form", () => {
    expect(formatStableDateTime("2026-09-24T08:05:00+00:00")).toBe("2026-09-24 13:05");
  });
});
