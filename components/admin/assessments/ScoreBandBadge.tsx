import type { Band } from "@/lib/attestation/types";

const DOT: Record<Band, string> = {
  green: "bg-status-ok",
  yellow: "bg-status-warning",
  red: "bg-status-outdated",
};

const FRAME: Record<Band, string> = {
  green: "border-status-ok/40 bg-status-ok/10",
  yellow: "border-status-warning/40 bg-status-warning/10",
  red: "border-status-outdated/40 bg-status-outdated/10",
};

/** A score with its band (admin only — docs/ATTESTATION.md §7). The colour is
 * a dot and a tint; the percentage and the band's name are text in
 * text-primary-dark, so the colour never carries the meaning alone. Pure
 * markup, usable from a server or a client component. */
export function ScoreBandBadge({ band, percent, bandLabel }: { band: Band; percent: string; bandLabel: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[12px] font-semibold tabular-nums text-primary-dark ${FRAME[band]}`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[band]}`} aria-hidden="true" />
      {percent}
      <span className="font-medium text-text-secondary">{bandLabel}</span>
    </span>
  );
}
