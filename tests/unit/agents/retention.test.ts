import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { rpc, runContentScan } = vi.hoisted(() => ({ rpc: vi.fn(), runContentScan: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/lib/agents/stale-scan", () => ({ runContentScan }));
vi.mock("@/lib/env", () => ({ getCronEnv: () => ({ CRON_SECRET: "cron-secret-for-tests" }) }));

import { runAssessmentRetention, runRetention } from "@/lib/agents/retention";
import { GET } from "@/app/api/cron/content-scan/route";

const RESULT = {
  skipped: false,
  telemetry_events_deleted: 120,
  copilot_logs_redacted: 4,
  copilot_logs_deleted: 2,
  content_gate_reports_deleted: 0,
  admin_notifications_deleted: 1,
  content_versions_updates_deleted: 3,
  content_versions_deletes_deleted: 0,
};

const ASSESSMENT_RESULT = {
  skipped: false,
  window_days: 365,
  attempts_deleted: 3,
  messages_deleted: 41,
  unlocks_deleted: 1,
};

type RpcAnswer = { data: unknown; error: { message: string; code: string } | null };

/** Each retention function answers for itself, so a test can fail one alone. */
function answerRpc(overrides: Partial<Record<"run_retention" | "run_assessment_retention", RpcAnswer>> = {}) {
  rpc.mockImplementation(async (name: string): Promise<RpcAnswer> => {
    if (name === "run_retention") return overrides.run_retention ?? { data: [RESULT], error: null };
    if (name === "run_assessment_retention") {
      return overrides.run_assessment_retention ?? { data: [ASSESSMENT_RESULT], error: null };
    }
    throw new Error(`unexpected rpc ${name}`);
  });
}

function calledRpcs(): string[] {
  return rpc.mock.calls.map(([name]) => String(name));
}

function cronRequest(): NextRequest {
  return new NextRequest("http://localhost/api/cron/content-scan", {
    headers: { authorization: "Bearer cron-secret-for-tests" },
  });
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  rpc.mockReset();
  runContentScan.mockReset();
  answerRpc();
  runContentScan.mockResolvedValue({ created: 2, skipped: 1 });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("runRetention", () => {
  it("asks the database to skip when its own pg_cron job runs the policy", async () => {
    expect(await runRetention()).toEqual(RESULT);
    expect(rpc).toHaveBeenCalledWith("run_retention", { p_skip_if_scheduled: true });
  });

  it("throws on an error or a missing row", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "permission denied for function run_retention", code: "42501" } });
    await expect(runRetention()).rejects.toThrow("run_retention: 42501");

    rpc.mockResolvedValueOnce({ data: [], error: null });
    await expect(runRetention()).rejects.toThrow("no result row");
  });
});

describe("runAssessmentRetention", () => {
  it("asks the database to skip when 0023's own pg_cron job runs the policy", async () => {
    expect(await runAssessmentRetention()).toEqual(ASSESSMENT_RESULT);
    expect(rpc).toHaveBeenCalledWith("run_assessment_retention", { p_skip_if_scheduled: true });
  });

  it("passes the database's answer through — the window is the config row's, not the app's", async () => {
    const skipped = { ...ASSESSMENT_RESULT, skipped: true, window_days: 90, attempts_deleted: 0, messages_deleted: 0, unlocks_deleted: 0 };
    answerRpc({ run_assessment_retention: { data: [skipped], error: null } });
    expect(await runAssessmentRetention()).toEqual(skipped);
  });

  it("throws on an error or a missing row", async () => {
    answerRpc({
      run_assessment_retention: {
        data: null,
        error: { message: "permission denied for function run_assessment_retention", code: "42501" },
      },
    });
    await expect(runAssessmentRetention()).rejects.toThrow("run_assessment_retention: 42501");

    answerRpc({ run_assessment_retention: { data: [], error: null } });
    await expect(runAssessmentRetention()).rejects.toThrow("no result row");
  });
});

describe("GET /api/cron/content-scan", () => {
  it("runs the scan, then both retention policies, and reports all three", async () => {
    const response = await GET(cronRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      created: 2,
      skipped: 1,
      retention: RESULT,
      assessmentRetention: ASSESSMENT_RESULT,
    });
    expect(runContentScan.mock.invocationCallOrder[0]).toBeLessThan(rpc.mock.invocationCallOrder[0]);
    expect(calledRpcs()).toEqual(["run_retention", "run_assessment_retention"]);
  });

  it("reports a retention failure as its own error, without the database message", async () => {
    answerRpc({ run_retention: { data: null, error: { message: "relation cron.job does not exist", code: "42P01" } } });
    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: "retention_failed" });
    expect(JSON.stringify(body)).not.toContain("cron.job");
    expect(runContentScan).toHaveBeenCalledOnce();
  });

  it("still runs the attestation's retention when the general one fails", async () => {
    answerRpc({ run_retention: { data: null, error: { message: "canceling statement due to statement timeout", code: "57014" } } });
    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    expect(calledRpcs()).toEqual(["run_retention", "run_assessment_retention"]);
  });

  it("reports an attestation retention failure as its own error, after the general policy ran", async () => {
    answerRpc({
      run_assessment_retention: { data: null, error: { message: "relation public.assessment_attempts does not exist", code: "42P01" } },
    });
    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    const body: unknown = await response.json();
    expect(body).toEqual({ error: "assessment_retention_failed" });
    expect(JSON.stringify(body)).not.toContain("assessment_attempts");
    expect(calledRpcs()).toEqual(["run_retention", "run_assessment_retention"]);
  });

  it("does not run retention when the scan fails", async () => {
    runContentScan.mockRejectedValueOnce(new Error("content_faqs: timeout"));
    const response = await GET(cronRequest());

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "scan_failed" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("still refuses a request without the bearer secret", async () => {
    const response = await GET(new NextRequest("http://localhost/api/cron/content-scan"));

    expect(response.status).toBe(401);
    expect(runContentScan).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
