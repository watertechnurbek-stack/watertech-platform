import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  COPILOT_QUESTION_RETENTION_DAYS,
  copilotAnsweredRate,
  faqPrefillHref,
  formatLatency,
  formatRate,
  toCopilotStats,
  toUnansweredQuestions,
  type CopilotStatsRow,
  type CopilotUnansweredRow,
} from "@/lib/dashboard/copilot";

const t = (key: "ms" | "seconds", values: { value: number }): string => `${values.value} ${key === "ms" ? "ms" : "s"}`;

const statsRow: CopilotStatsRow = {
  total_count: 11,
  ok_count: 4,
  no_hits_count: 5,
  error_count: 1,
  rate_limited_count: 1,
  no_hits_rate: 0.5,
  error_rate: 0.1,
  p50_latency_ms: 900,
  p95_latency_ms: 3600,
};

describe("toCopilotStats", () => {
  it("maps the single row of copilot_stats", () => {
    expect(toCopilotStats([statsRow])).toEqual({
      total: 11,
      ok: 4,
      noHits: 5,
      errors: 1,
      rateLimited: 1,
      noHitsRate: 0.5,
      errorRate: 0.1,
      p50Ms: 900,
      p95Ms: 3600,
    });
  });

  it("keeps null rates and latencies — an empty window is not zero", () => {
    const empty = toCopilotStats([
      { ...statsRow, total_count: 0, ok_count: 0, no_hits_count: 0, error_count: 0, rate_limited_count: 0, no_hits_rate: null, error_rate: null, p50_latency_ms: null, p95_latency_ms: null },
    ]);
    expect([empty.noHitsRate, empty.errorRate, empty.p50Ms, empty.p95Ms]).toEqual([null, null, null, null]);
  });

  it("throws on no row, which the page turns into the widget's error state", () => {
    expect(() => toCopilotStats([])).toThrow();
  });
});

describe("toUnansweredQuestions", () => {
  const rows: CopilotUnansweredRow[] = [
    { question_key: "narx qancha?", sample_question: "Нарх қанча?", ask_count: 2, operator_count: 2, last_asked_at: "2001-03-10T03:00:00+00:00" },
    { question_key: "mahsulot kafolati", sample_question: "Mahsulot kafolati", ask_count: 1, operator_count: 1, last_asked_at: "2001-03-10T04:00:00.5+00:00" },
  ];

  it("keeps the SQL's order and normalizes the timestamp", () => {
    expect(toUnansweredQuestions(rows)).toEqual([
      { key: "narx qancha?", question: "Нарх қанча?", count: 2, operatorCount: 2, lastAskedIso: "2001-03-10T03:00:00.000Z" },
      { key: "mahsulot kafolati", question: "Mahsulot kafolati", count: 1, operatorCount: 1, lastAskedIso: "2001-03-10T04:00:00.500Z" },
    ]);
  });

  it("carries no operator identity — only a count", () => {
    for (const item of toUnansweredQuestions(rows)) {
      expect(Object.keys(item).sort()).toEqual(["count", "key", "lastAskedIso", "operatorCount", "question"]);
    }
  });
});

describe("formatRate / formatLatency", () => {
  it("shows a fraction as a percentage with at most one decimal", () => {
    expect(formatRate(0.5)).toBe("50%");
    expect(formatRate(0.1234)).toBe("12.3%");
    expect(formatRate(0)).toBe("0%");
    expect(formatRate(1)).toBe("100%");
    expect(formatRate(null)).toBe("—");
  });

  it("shows milliseconds below a second and seconds above", () => {
    expect(formatLatency(850, t)).toBe("850 ms");
    expect(formatLatency(999.4, t)).toBe("999 ms");
    expect(formatLatency(1000, t)).toBe("1 s");
    expect(formatLatency(3600, t)).toBe("3.6 s");
    expect(formatLatency(null, t)).toBe("—");
  });
});

describe("copilotAnsweredRate", () => {
  it("is the answered share of the requests the copilot handled — rate-limited ones left out", () => {
    // 11 requests, 2 rate-limited: 4 of the 9 handled were answered.
    expect(copilotAnsweredRate({ total: 11, ok: 4, rateLimited: 2 })).toBeCloseTo(4 / 9);
    expect(copilotAnsweredRate({ total: 3, ok: 3, rateLimited: 0 })).toBe(1);
  });

  it("is null when nothing was handled", () => {
    expect(copilotAnsweredRate({ total: 0, ok: 0, rateLimited: 0 })).toBeNull();
    expect(copilotAnsweredRate({ total: 2, ok: 0, rateLimited: 2 })).toBeNull();
  });
});

describe("faqPrefillHref", () => {
  it("pre-fills the FAQ form through the existing ?question= param, encoded", () => {
    expect(faqPrefillHref("Narx qancha?")).toBe("/admin/faq/new?question=Narx%20qancha%3F");
    expect(faqPrefillHref("a&b=c#d")).toBe("/admin/faq/new?question=a%26b%3Dc%23d");
    expect(new URL(faqPrefillHref("Нарх қанча?"), "https://x.test").searchParams.get("question")).toBe("Нарх қанча?");
  });
});

describe("COPILOT_QUESTION_RETENTION_DAYS", () => {
  it("is the number run_retention() in 0016 nulls a question after", () => {
    const migration = readFileSync(
      path.resolve(__dirname, "../../../supabase/migrations/0016_dashboard_rpc_and_retention.sql"),
      "utf8"
    );
    const match = /copilot_redact_question_days constant integer := (\d+);/.exec(migration);
    expect(match).not.toBeNull();
    expect(COPILOT_QUESTION_RETENTION_DAYS).toBe(Number(match?.[1]));
  });
});
