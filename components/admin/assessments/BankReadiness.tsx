import { CheckCircle2, CircleDashed } from "lucide-react";

/** One day's bank against what a draw needs (published / itemCount). */
export interface BankReadinessDay {
  day: number;
  label: string;
  value: string;
  ready: boolean;
  /** "Ready", or how many more are needed. */
  note: string;
}

/** Published items per day against what the day draws (docs/ATTESTATION.md
 * §10: S05 refuses to start a day whose bank is short). Pure markup; every
 * label arrives translated. */
export function BankReadiness({ days, label }: { days: readonly BankReadinessDay[]; label: string }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {days.map((day) => (
        <div key={day.day} className="min-w-0 rounded-2xl border border-border bg-surface px-4 py-3 shadow-softer">
          <dt className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-secondary">
            {day.ready ? (
              <CheckCircle2 size={13} className="shrink-0 text-status-ok" aria-hidden="true" />
            ) : (
              <CircleDashed size={13} className="shrink-0 text-status-warning" aria-hidden="true" />
            )}
            {day.label}
          </dt>
          <dd className="mt-1 text-[15px] font-semibold tabular-nums text-primary-dark">{day.value}</dd>
          <dd className="mt-0.5 truncate text-[12px] text-text-secondary">{day.note}</dd>
        </div>
      ))}
    </dl>
  );
}
