import type { ReactNode } from "react";
import { barPercent } from "@/lib/admin/charts";

const FILL = { green: "bg-chart-green", blue: "bg-chart-blue" } as const;

export interface InlineBarProps {
  /** What the bar length is computed from. */
  value: number;
  /** The column's largest value — every row's bar is measured against it. */
  max: number;
  /** Green for time and activity, blue for content usage (CLAUDE.md §15). */
  tone: keyof typeof FILL;
  /** The value as text, already formatted — it carries the number; the bar
   * only places it against the rest of the column. */
  children: ReactNode;
}

/** A table cell's number with a short bar beside it (the overview's team
 * table). Server markup, static: the table re-sorts on the client, and a
 * column of bars growing again on every sort would be noise. Decorative for a
 * screen reader, which reads the text. */
export function InlineBar({ value, max, tone, children }: InlineBarProps) {
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span aria-hidden="true" className="h-1.5 w-14 shrink-0 overflow-hidden rounded-full bg-chart-track">
        <span className={`block h-full rounded-full ${FILL[tone]}`} style={{ width: `${barPercent(value, max)}%` }} />
      </span>
      <span className="min-w-[4.5rem] text-right tabular-nums">{children}</span>
    </span>
  );
}
