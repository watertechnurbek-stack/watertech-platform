import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/routing";
import { DeltaBadge, type DeltaBetter, type DeltaUnit } from "@/components/admin/charts/DeltaBadge";

export interface StatCardProps {
  label: string;
  /** Already formatted for the locale ("12", "3 soat 15 daq"). */
  value: string;
  /** One line under the number, e.g. "12 xodimdan 9 tasi". */
  caption?: string;
  delta?: { value: number | null; unit: DeltaUnit; better?: DeltaBetter };
  href?: string;
  icon?: LucideIcon;
}

/** One headline number. Fixed height (h-[132px]) so the overview skeleton
 * (app/[locale]/(admin)/admin/(overview)/loading.tsx) matches it exactly; the
 * caption is one truncated line for the same reason. */
export function StatCard({ label, value, caption, delta, href, icon: Icon }: StatCardProps) {
  const body = (
    <div className="flex h-[132px] flex-col justify-between rounded-2xl border border-border bg-surface p-4 shadow-softer">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-[12.5px] font-medium text-text-secondary">{label}</p>
        {Icon && <Icon size={16} className="shrink-0 text-text-secondary" aria-hidden="true" />}
      </div>
      <div className="space-y-2">
        <p className="truncate text-[24px] font-bold leading-none tabular-nums text-primary-dark" title={value}>
          {value}
        </p>
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-[12px] text-text-secondary">{caption}</p>
          {delta && (
            <span className="shrink-0">
              <DeltaBadge value={delta.value} unit={delta.unit} better={delta.better} />
            </span>
          )}
        </div>
      </div>
    </div>
  );

  if (!href) return body;
  return (
    <Link
      href={href}
      className="block rounded-2xl transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {body}
    </Link>
  );
}
