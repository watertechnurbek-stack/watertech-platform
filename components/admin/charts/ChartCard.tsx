import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Admin chart primitives (CLAUDE.md §15) — server-rendered divs, no chart
// library. Which one to reach for:
//
//   StatCard     one headline number with a caption and a delta vs the previous
//                period — a row of them opens an overview page.
//   DeltaBadge   a change on its own (%, percentage points or an absolute
//                count); StatCard already embeds one.
//   BarList      "who / what has the most X": ranked horizontal bars, one row
//                per item, value printed at the bar's end. Green for time and
//                activity, blue for content usage.
//   ColumnBars   a series over time (days of a range, hours of a day): vertical
//                bars, value above each one. Scrolls sideways on its own when
//                the columns do not fit.
//   CompareTable many people or items across many metrics, sortable (client).
//   InlineBar    a number in a table cell with a short bar beside it.
//   Sparkline    the shape of a daily series in a table cell (SVG line).
//   ChartCard    the titled panel any of the above sits in: title, one-line
//                description, content, and the `action` slot for its one
//                "all" link — the same anatomy on every monitoring page.
//
// Bars grow once through BarGrow/BarGrowGroup; lengths are inline style
// percentages. Chart tokens (bg-/stroke-/fill-chart-*) are marks only — every
// number is printed as text-primary-dark next to its mark, so colour never
// carries it.

export interface ChartCardProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  /** Top-right slot: a link, a legend, a toggle. */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  /** The section's anchor — a link elsewhere can land on this card
   * (/admin/knowledge#gaps). */
  id?: string;
}

/** A titled panel in the admin card style. The title is an <h2>, so a screen
 * reader can jump between the page's panels by heading. With an `id` the card
 * is a link target; scroll-mt keeps it clear of the sticky header. */
export function ChartCard({ icon: Icon, title, description, action, children, className = "", id }: ChartCardProps) {
  return (
    <section
      id={id}
      className={`min-w-0 scroll-mt-20 rounded-2xl border border-border bg-surface p-4 shadow-softer sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon size={16} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold text-primary-dark">{title}</h2>
            {description && <p className="mt-0.5 text-[12.5px] text-text-secondary">{description}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}
