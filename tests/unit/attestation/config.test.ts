import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  DEFAULT_ASSESSMENT_CONFIG,
  PART_A_GRACE_SECONDS,
  getAssessmentConfig,
  parseAssessmentConfigRow,
} from "@/lib/attestation/config";
import type { Database } from "@/lib/supabase/database.types";

const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/0023_attestation.sql"),
  "utf8"
);

/** The JSON between the `$defaults$` markers of 0023 — the row it seeds. */
function migrationDefaults(): unknown {
  const match = /select \$defaults\$([\s\S]*?)\$defaults\$::jsonb/.exec(MIGRATION);
  if (!match?.[1]) throw new Error("0023 has no $defaults$ document");
  return JSON.parse(match[1]);
}

const STORED_ROW = {
  weights: { "1": { partA: 50, partB: 50 }, "2": { partA: 40, partB: 60 }, "3": { partA: 40, partB: 60 }, "4": { partA: 20, partB: 80 } },
  thresholds: { green: 85, yellow: 65 },
  day_settings: {
    "1": { itemCount: 12, itemSeconds: 60, minTurns: 6, maxTurns: 8, partBMinutes: 20 },
    "2": { itemCount: 12, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 },
    "3": { itemCount: 10, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 },
    "4": { itemCount: 6, itemSeconds: 90, minTurns: 10, maxTurns: 14, partBMinutes: 25 },
  },
  extra_facts: "Zavod quvvati: sutkasiga 40 tonna.",
  extra_facts_ru: "",
  retention_days: 400,
  version: 7,
  updated_at: "2026-09-26T10:00:00+00:00",
  updated_by: "owner@watertech.uz",
};

function clientAnswering(body: unknown, status = 200) {
  const fetch = async (): Promise<Response> =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  return createClient<Database>("https://example.supabase.co", "anon-key-anon-key-anon-key", {
    global: { fetch },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  consoleError.mockRestore();
});

describe("DEFAULT_ASSESSMENT_CONFIG", () => {
  it("is exactly what 0023 seeds", () => {
    const defaults = DEFAULT_ASSESSMENT_CONFIG;
    expect(migrationDefaults()).toEqual({
      weights: defaults.weights,
      thresholds: defaults.thresholds,
      day_settings: defaults.daySettings,
      retention_days: defaults.retentionDays,
    });
  });

  it("parses as a stored row (the database's rules are the schema's)", () => {
    const seeded = migrationDefaults();
    expect(
      parseAssessmentConfigRow({
        ...(typeof seeded === "object" && seeded !== null ? seeded : {}),
        extra_facts: "",
        extra_facts_ru: "",
        version: 1,
        updated_at: "2026-09-26T00:00:00+00:00",
        updated_by: null,
      })
    ).not.toBeNull();
  });

  it("is version 0 — nothing stored to save over — and grants a small grace", () => {
    expect(DEFAULT_ASSESSMENT_CONFIG.version).toBe(0);
    expect(PART_A_GRACE_SECONDS).toBeGreaterThan(0);
    expect(PART_A_GRACE_SECONDS).toBeLessThanOrEqual(10);
  });
});

describe("parseAssessmentConfigRow", () => {
  it("maps a stored row into the domain shape", () => {
    expect(parseAssessmentConfigRow(STORED_ROW)).toEqual({
      weights: STORED_ROW.weights,
      thresholds: { green: 85, yellow: 65 },
      daySettings: STORED_ROW.day_settings,
      extraFacts: "Zavod quvvati: sutkasiga 40 tonna.",
      extraFactsRu: "",
      retentionDays: 400,
      version: 7,
      updatedAt: "2026-09-26T10:00:00+00:00",
      updatedBy: "owner@watertech.uz",
    });
  });

  it("refuses a row the app could not use", () => {
    expect(parseAssessmentConfigRow({ ...STORED_ROW, thresholds: { green: 60, yellow: 70 } })).toBeNull();
    expect(parseAssessmentConfigRow({ ...STORED_ROW, weights: { "1": { partA: 50, partB: 50 } } })).toBeNull();
    expect(parseAssessmentConfigRow(null)).toBeNull();
  });
});

describe("getAssessmentConfig", () => {
  it("reads the stored row", async () => {
    const loaded = await getAssessmentConfig(clientAnswering(STORED_ROW));
    expect(loaded.source).toBe("database");
    expect(loaded.config.version).toBe(7);
  });

  it("falls back to the defaults on an error, a missing row or a row that does not parse — and says so", async () => {
    const failed = await getAssessmentConfig(
      clientAnswering({ code: "42P01", message: "relation does not exist", details: null, hint: null }, 404)
    );
    expect(failed).toEqual({ config: DEFAULT_ASSESSMENT_CONFIG, source: "defaults" });

    const missing = await getAssessmentConfig(clientAnswering(null));
    expect(missing.source).toBe("defaults");

    const garbled = await getAssessmentConfig(clientAnswering({ ...STORED_ROW, day_settings: {} }));
    expect(garbled.source).toBe("defaults");
    expect(consoleError).toHaveBeenCalled();
  });
});
