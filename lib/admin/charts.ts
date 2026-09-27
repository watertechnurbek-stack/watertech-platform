// Pure geometry for the admin chart primitives (components/admin/charts/,
// CLAUDE.md §15). Bars are sized with inline style percentages computed here,
// so tests/unit/admin/charts.test.ts can pin the edge cases (empty, all-zero,
// a tiny value next to a large one) without rendering anything.

/** Smallest visible length for a non-zero value, in % of the track — a sliver
 * still says "not nothing" next to the leader. */
export const MIN_VISIBLE_PERCENT = 2;

/** Largest value of a series; 0 for an empty or all-zero one. Negative and
 * non-finite values count as 0 — a bar cannot be shorter than nothing. */
export function seriesMax(values: readonly number[]): number {
  let max = 0;
  for (const value of values) if (Number.isFinite(value) && value > max) max = value;
  return max;
}

/** A bar's length in % of `max`: 0 for zero (or when everything is zero),
 * otherwise at least MIN_VISIBLE_PERCENT and at most 100. */
export function barPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(100, Math.max((value / max) * 100, MIN_VISIBLE_PERCENT));
}

export interface SparklineGeometry {
  /** The series as one SVG path ("M x y L x y …"); "" for an empty series. */
  line: string;
  /** The same path closed down to the baseline, for the tinted area under it. */
  area: string;
  /** Where the newest value sits — the sparkline marks it with a dot. */
  last: { x: number; y: number } | null;
}

/** Rounded to 0.01 of a unit: short path strings, and identical output on the
 * server and in tests whatever the float noise. */
function coordinate(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * A sparkline's shapes in a `width` × `height` box, oldest value on the left.
 * `inset` keeps the stroke and the end dot inside the box. The values scale
 * against the series' own largest (seriesMax): an all-zero series is a flat
 * line on the baseline, never a line drawn at mid-height. One value is a
 * level stub across the full width, so it still reads as a measured window.
 */
export function sparklineGeometry(
  values: readonly number[],
  width: number,
  height: number,
  inset = 2
): SparklineGeometry {
  if (values.length === 0) return { line: "", area: "", last: null };
  const max = seriesMax(values);
  const baseline = height - inset;
  const span = Math.max(0, height - inset * 2);
  const stepCount = Math.max(1, values.length - 1);
  const stepWidth = Math.max(0, width - inset * 2) / stepCount;

  const points = (values.length === 1 ? [values[0] ?? 0, values[0] ?? 0] : values).map((value, index) => {
    const safe = Number.isFinite(value) && value > 0 ? value : 0;
    return {
      x: coordinate(inset + index * (values.length === 1 ? width - inset * 2 : stepWidth)),
      y: coordinate(max > 0 ? baseline - (safe / max) * span : baseline),
    };
  });

  const line = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const first = points[0];
  const last = points[points.length - 1];
  const area =
    first && last ? `${line} L${last.x} ${coordinate(baseline)} L${first.x} ${coordinate(baseline)} Z` : "";
  return { line, area, last: last ?? null };
}
