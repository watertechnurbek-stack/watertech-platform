import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { assessmentConfigRowSchema } from "./schemas";
import type { AssessmentConfig } from "./types";

// The attestation's settings (public.assessment_config, one row) with typed
// defaults. Server-only: the settings include the band thresholds and the
// admin's extra facts, and nothing on a candidate path returns them.

/** Seconds the server allows on top of a Part A item's limit — network and
 * rendering, not thinking time (docs/ATTESTATION.md §3). */
export const PART_A_GRACE_SECONDS = 5;

/** What 0023 seeds — tests/unit/attestation/config.test.ts compares this with
 * the migration's `$defaults$` document. Used as-is when the row cannot be
 * read, and then `version` is 0: there is nothing to save over. */
export const DEFAULT_ASSESSMENT_CONFIG: AssessmentConfig = {
  weights: {
    1: { partA: 40, partB: 60 },
    2: { partA: 40, partB: 60 },
    3: { partA: 40, partB: 60 },
    4: { partA: 20, partB: 80 },
  },
  thresholds: { green: 80, yellow: 60 },
  daySettings: {
    1: { itemCount: 12, itemSeconds: 60, minTurns: 6, maxTurns: 8, partBMinutes: 20 },
    2: { itemCount: 12, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 },
    3: { itemCount: 10, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 },
    4: { itemCount: 6, itemSeconds: 90, minTurns: 10, maxTurns: 14, partBMinutes: 20 },
  },
  extraFacts: "",
  extraFactsRu: "",
  retentionDays: 365,
  version: 0,
  updatedAt: null,
  updatedBy: null,
};

export type AssessmentConfigSource = "database" | "defaults";

export interface LoadedAssessmentConfig {
  config: AssessmentConfig;
  /** "defaults" when the row is missing, unreadable or does not parse — the
   * settings page says so instead of offering to save over nothing. */
  source: AssessmentConfigSource;
}

/** The stored row in the domain shape, or null when it does not parse. */
export function parseAssessmentConfigRow(row: unknown): AssessmentConfig | null {
  const parsed = assessmentConfigRowSchema.safeParse(row);
  if (!parsed.success) return null;
  const stored = parsed.data;
  return {
    weights: stored.weights,
    thresholds: stored.thresholds,
    daySettings: stored.day_settings,
    extraFacts: stored.extra_facts,
    extraFactsRu: stored.extra_facts_ru,
    retentionDays: stored.retention_days,
    version: stored.version,
    updatedAt: stored.updated_at,
    updatedBy: stored.updated_by,
  };
}

const CONFIG_COLUMNS =
  "weights,thresholds,day_settings,extra_facts,extra_facts_ru,retention_days,version,updated_at,updated_by";

/** Reads the settings with whichever client the caller holds: the admin's
 * session (RLS: admin only) or, for S05's candidate paths, the service role.
 * Never throws: a failure is logged and answered with the defaults. */
export async function getAssessmentConfig(client: SupabaseClient<Database>): Promise<LoadedAssessmentConfig> {
  const { data, error } = await client.from("assessment_config").select(CONFIG_COLUMNS).eq("id", 1).maybeSingle();
  if (error) {
    console.error("[attestation] config read:", error.code ?? "", error.message);
    return { config: DEFAULT_ASSESSMENT_CONFIG, source: "defaults" };
  }
  if (!data) {
    console.error("[attestation] config: no assessment_config row — is 0023_attestation.sql applied?");
    return { config: DEFAULT_ASSESSMENT_CONFIG, source: "defaults" };
  }
  const config = parseAssessmentConfigRow(data);
  if (!config) {
    console.error("[attestation] config: the stored row does not parse");
    return { config: DEFAULT_ASSESSMENT_CONFIG, source: "defaults" };
  }
  return { config, source: "database" };
}
