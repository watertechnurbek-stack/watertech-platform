import type { Database } from "@/lib/supabase/database.types";

// /admin/knowledge (the Copilot card and the Copilot half of the unanswered
// questions): rows of the two 0019 functions turned into the shapes the
// components take, plus the formatting helpers they share. Pure — the calls
// themselves are in lib/dashboard/copilot-window.ts.
//
// Question text is manager-only data. It is rendered here and pre-filled into
// the FAQ form, and it never goes anywhere near telemetry
// (lib/telemetry/schema.ts).

type CopilotFunctions = Database["public"]["Functions"];
export type CopilotStatsRow = CopilotFunctions["copilot_stats"]["Returns"][number];
export type CopilotUnansweredRow = CopilotFunctions["copilot_unanswered"]["Returns"][number];

/** Ranked-list length, sent as p_limit so ranking happens in SQL before the cut. */
export const UNANSWERED_LIMIT = 100;

/** run_retention() (0016) nulls a copilot question this many days after it was
 * asked. SQL cannot import it, so this is a copy — tests/unit/dashboard/copilot.test.ts
 * reads the constant out of the migration and fails when the two drift. */
export const COPILOT_QUESTION_RETENTION_DAYS = 30;

export interface CopilotStatsSummary {
  total: number;
  ok: number;
  noHits: number;
  errors: number;
  rateLimited: number;
  /** Fractions in [0, 1] of the requests the copilot actually handled (total minus
   * rate_limited); null when there were none. */
  noHitsRate: number | null;
  errorRate: number | null;
  /** Of requests that answered (ok + no_hits); null when there were none. */
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface UnansweredQuestion {
  /** The normalized grouping key — stable, so it is the React key. */
  key: string;
  /** The most recent wording of the group, as typed. */
  question: string;
  count: number;
  operatorCount: number;
  lastAskedIso: string;
}

export function toCopilotStats(rows: CopilotStatsRow[]): CopilotStatsSummary {
  const [row] = rows;
  if (!row) throw new Error("no row");
  return {
    total: row.total_count,
    ok: row.ok_count,
    noHits: row.no_hits_count,
    errors: row.error_count,
    rateLimited: row.rate_limited_count,
    noHitsRate: row.no_hits_rate,
    errorRate: row.error_rate,
    p50Ms: row.p50_latency_ms,
    p95Ms: row.p95_latency_ms,
  };
}

/** Order is the SQL's (count, then most recent) and is not touched here.
 * Normalizes the timestamp to toISOString() form — PostgREST sends `…+00:00`. */
export function toUnansweredQuestions(rows: CopilotUnansweredRow[]): UnansweredQuestion[] {
  return rows.map((row) => ({
    key: row.question_key,
    question: row.sample_question,
    count: row.ask_count,
    operatorCount: row.operator_count,
    lastAskedIso: new Date(row.last_asked_at).toISOString(),
  }));
}

/** Share, in [0, 1], of the requests the copilot handled (total minus the
 * rate-limited ones — the same base as noHitsRate and errorRate) that it
 * answered from the knowledge base; null when it handled none. */
export function copilotAnsweredRate(stats: Pick<CopilotStatsSummary, "total" | "ok" | "rateLimited">): number | null {
  const handled = stats.total - stats.rateLimited;
  return handled > 0 ? stats.ok / handled : null;
}

/** "12.5%" — one decimal, none when it is a whole number; "—" when there was
 * nothing to divide. */
export function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 1000) / 10}%`;
}

/** Translator for the `dashboard.copilot.latency` messages. */
export type LatencyTranslator = (key: "ms" | "seconds", values: { value: number }) => string;

/** "850 ms" below a second, "1.2 s" above; "—" when nothing answered. */
export function formatLatency(ms: number | null, t: LatencyTranslator): string {
  if (ms === null) return "—";
  if (ms < 1000) return t("ms", { value: Math.round(ms) });
  return t("seconds", { value: Math.round(ms / 100) / 10 });
}

/** The /admin/faq/new link that pre-fills the FAQ form with a question. */
export function faqPrefillHref(question: string): string {
  return `/admin/faq/new?question=${encodeURIComponent(question)}`;
}
