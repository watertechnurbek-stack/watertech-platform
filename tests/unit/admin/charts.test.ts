import { describe, expect, it } from "vitest";
import { MIN_VISIBLE_PERCENT, barPercent, seriesMax, sparklineGeometry } from "@/lib/admin/charts";

describe("seriesMax", () => {
  it("is 0 for an empty or all-zero series", () => {
    expect(seriesMax([])).toBe(0);
    expect(seriesMax([0, 0, 0])).toBe(0);
  });

  it("ignores negative and non-finite values", () => {
    expect(seriesMax([-5, 3, Number.NaN, Number.POSITIVE_INFINITY, 2])).toBe(3);
  });
});

describe("barPercent", () => {
  it("draws nothing for zero, and nothing when everything is zero", () => {
    expect(barPercent(0, 10)).toBe(0);
    expect(barPercent(0, 0)).toBe(0);
    expect(barPercent(5, 0)).toBe(0);
  });

  it("scales against the largest value", () => {
    expect(barPercent(10, 10)).toBe(100);
    expect(barPercent(5, 10)).toBe(50);
    expect(barPercent(1, 4)).toBe(25);
  });

  it("keeps a tiny non-zero value visible next to a large one", () => {
    expect(barPercent(1, 10_000)).toBe(MIN_VISIBLE_PERCENT);
  });

  it("never exceeds the track or accepts garbage", () => {
    expect(barPercent(20, 10)).toBe(100);
    expect(barPercent(-3, 10)).toBe(0);
    expect(barPercent(Number.NaN, 10)).toBe(0);
    expect(barPercent(3, Number.NaN)).toBe(0);
  });
});

describe("sparklineGeometry", () => {
  it("draws nothing for an empty series", () => {
    expect(sparklineGeometry([], 96, 28)).toEqual({ line: "", area: "", last: null });
  });

  it("puts an all-zero series flat on the baseline, never at mid-height", () => {
    const { line, last } = sparklineGeometry([0, 0, 0], 96, 28);
    expect(line).toBe("M2 26 L48 26 L94 26");
    expect(last).toEqual({ x: 94, y: 26 });
  });

  it("scales against the series' own peak, inside the inset, oldest value on the left", () => {
    const { line, area, last } = sparklineGeometry([0, 10, 5], 96, 28);
    // Peak at the top inset (y 2), zero on the baseline (y 26), half-way at 14.
    expect(line).toBe("M2 26 L48 2 L94 14");
    expect(area).toBe("M2 26 L48 2 L94 14 L94 26 L2 26 Z");
    expect(last).toEqual({ x: 94, y: 14 });
  });

  it("draws one value as a level line across the box", () => {
    expect(sparklineGeometry([7], 96, 28).line).toBe("M2 2 L94 2");
  });

  it("treats negative and non-finite values as zero and rounds coordinates", () => {
    const { line } = sparklineGeometry([-4, Number.NaN, 3, 1], 100, 30);
    expect(line).toBe("M2 28 L34 28 L66 2 L98 19.33");
  });
});
