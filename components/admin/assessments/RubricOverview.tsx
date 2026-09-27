/** One day's Part B rubric as the settings page shows it: criterion labels and
 * weights, translated on the server. */
export interface RubricOverviewDay {
  day: number;
  label: string;
  criteria: readonly { id: string; label: string; weight: number }[];
}

interface RubricOverviewProps {
  heading: string;
  hint: string;
  criterionLabel: string;
  weightLabel: string;
  days: readonly RubricOverviewDay[];
}

/** The Part B rubrics, read-only (docs/ATTESTATION.md §4). Server markup only:
 * lib/attestation/rubrics.ts is server-only, so the page resolves the labels
 * and hands this component plain strings and numbers — no client bundle ever
 * holds the criteria. */
export function RubricOverview({ heading, hint, criterionLabel, weightLabel, days }: RubricOverviewProps) {
  return (
    <section aria-labelledby="assessment-rubrics-title" className="space-y-3 rounded-2xl border border-border bg-surface p-4 shadow-soft">
      <div>
        <h3 id="assessment-rubrics-title" className="text-[15px] font-semibold text-primary-dark">
          {heading}
        </h3>
        <p className="mt-0.5 text-[12px] text-text-secondary">{hint}</p>
      </div>
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
        {days.map((day) => (
          <div key={day.day} className="overflow-hidden rounded-xl border border-border bg-surface-alt/60">
            <table className="w-full text-left">
              <caption className="px-3 pb-1 pt-2.5 text-left text-[13px] font-semibold text-primary-dark">{day.label}</caption>
              <thead>
                <tr className="text-[12px] text-text-secondary">
                  <th scope="col" className="px-3 py-1.5 font-medium">
                    {criterionLabel}
                  </th>
                  <th scope="col" className="px-3 py-1.5 text-right font-medium">
                    {weightLabel}
                  </th>
                </tr>
              </thead>
              <tbody>
                {day.criteria.map((criterion) => (
                  <tr key={criterion.id} className="border-t border-border">
                    <td className="px-3 py-1.5 text-[12.5px] text-primary-dark">{criterion.label}</td>
                    <td className="px-3 py-1.5 text-right text-[12.5px] font-semibold tabular-nums text-primary-dark">
                      {criterion.weight}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
