import { AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/routing";
import type { Band } from "@/lib/attestation/types";
import { ScoreBandBadge } from "./ScoreBandBadge";

/** One submitted attempt, every label already translated and formatted on the
 * server (docs/ATTESTATION.md §17 — S07 replaces this list with the full
 * results matrix). */
export interface AssessmentResultRow {
  id: string;
  email: string;
  personHref: string;
  dayLabel: string;
  attemptLabel: string;
  statusLabel: string;
  submittedLabel: string;
  /** Null until the day has a score (submitted, evaluating, eval_failed). */
  score: { percent: string; band: Band; bandLabel: string; overridden: boolean } | null;
  needsReview: boolean;
}

export interface AssessmentResultsTableProps {
  rows: readonly AssessmentResultRow[];
  labels: {
    table: string;
    person: string;
    day: string;
    attempt: string;
    status: string;
    submitted: string;
    score: string;
    review: string;
    overridden: string;
    needsReview: string;
    noScore: string;
  };
}

export function AssessmentResultsTable({ rows, labels }: AssessmentResultsTableProps) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border bg-surface shadow-soft">
      <table className="w-full min-w-[760px] text-left text-[13px]">
        <caption className="sr-only">{labels.table}</caption>
        <thead>
          <tr className="border-b border-border bg-surface-alt/60">
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.person}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.day}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.attempt}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.status}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.submitted}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.score}</th>
            <th scope="col" className="px-4 py-2.5 font-semibold text-primary-dark">{labels.review}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-border last:border-0">
              <td className="px-4 py-2.5">
                <Link
                  href={row.personHref}
                  className="font-medium text-primary-dark hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {row.email}
                </Link>
              </td>
              <td className="whitespace-nowrap px-4 py-2.5 text-primary-dark">{row.dayLabel}</td>
              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-secondary">{row.attemptLabel}</td>
              <td className="whitespace-nowrap px-4 py-2.5 text-primary-dark">{row.statusLabel}</td>
              <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-text-secondary">{row.submittedLabel}</td>
              <td className="px-4 py-2.5">
                {row.score ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <ScoreBandBadge band={row.score.band} percent={row.score.percent} bandLabel={row.score.bandLabel} />
                    {row.score.overridden && <span className="text-[11px] text-text-secondary">{labels.overridden}</span>}
                  </span>
                ) : (
                  <span className="text-text-secondary">{labels.noScore}</span>
                )}
              </td>
              <td className="px-4 py-2.5">
                {row.needsReview && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-medium text-primary-dark">
                    <AlertTriangle size={13} className="text-status-warning" aria-hidden="true" />
                    {labels.needsReview}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
