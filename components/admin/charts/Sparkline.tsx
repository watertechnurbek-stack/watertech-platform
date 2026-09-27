import { sparklineGeometry } from "@/lib/admin/charts";

/** Drawn at exactly this size (w-24 h-7), so the viewBox needs no stretching
 * and the end dot stays round. */
const WIDTH = 96;
const HEIGHT = 28;

const STROKE = { green: "stroke-chart-green", blue: "stroke-chart-blue" } as const;
const AREA = { green: "fill-chart-green/15", blue: "fill-chart-blue/15" } as const;
const DOT = { green: "fill-chart-green", blue: "fill-chart-blue" } as const;

export interface SparklineProps {
  /** One value per day, oldest first. */
  values: readonly number[];
  /** The series in words and numbers ("Ali — 14 days, minutes a day: 0, 12,
   * 45 …"): the accessible name, and the hover title. */
  label: string;
  tone?: keyof typeof STROKE;
}

/** A small line of a daily series for a table cell (the overview's team
 * table). Pure SVG from the server — no client code, no motion; the geometry
 * is lib/admin/charts.ts's sparklineGeometry, scaled to the series' own peak,
 * so it shows the shape of someone's days, not a comparison between rows (the
 * row's numbers do that). An all-zero series is a flat line on the baseline. */
export function Sparkline({ values, label, tone = "green" }: SparklineProps) {
  const { line, area, last } = sparklineGeometry(values, WIDTH, HEIGHT);
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      width={WIDTH}
      height={HEIGHT}
      className="inline-block h-7 w-24 shrink-0 align-middle"
    >
      <title>{label}</title>
      <line x1={0} x2={WIDTH} y1={HEIGHT - 2} y2={HEIGHT - 2} strokeWidth={1} className="stroke-border" />
      {area && <path d={area} className={AREA[tone]} />}
      {line && (
        <path
          d={line}
          fill="none"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={STROKE[tone]}
        />
      )}
      {last && <circle cx={last.x} cy={last.y} r={2} className={DOT[tone]} />}
    </svg>
  );
}
