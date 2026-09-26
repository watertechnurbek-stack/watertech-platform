import { describe, expect, it } from "vitest";
import { formatRelative, formatScorePercent, formatStableDateTime, type RelativeTimeTranslator } from "@/lib/admin/format";

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

describe("formatScorePercent", () => {
  it("shows a 0–100 score as a percentage with at most one decimal", () => {
    // Node's ICU spaces and separates by locale; the digits are what matter.
    expect(formatScorePercent(72.46, "uz").replace(/\s/g, "")).toMatch(/^72[.,]5%$/);
    expect(formatScorePercent(100, "ru").replace(/\s/g, "")).toBe("100%");
    expect(formatScorePercent(0, "uz").replace(/\s/g, "")).toBe("0%");
  });
});
