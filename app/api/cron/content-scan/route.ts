import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCronEnv } from "@/lib/env";
import { runContentScan, type ContentScanResult } from "@/lib/agents/stale-scan";
import {
  runAssessmentRetention,
  runRetention,
  type AssessmentRetentionResult,
  type RetentionResult,
} from "@/lib/agents/retention";

export const runtime = "nodejs";
// Never prerendered or cached: a GET here is a side-effecting job trigger.
export const dynamic = "force-dynamic";

type CronResponse =
  | (ContentScanResult & { retention: RetentionResult; assessmentRetention: AssessmentRetentionResult })
  | { error: string };

/** Constant-time compare, so response timing leaks nothing about the secret. */
function isAuthorized(header: string | null, secret: string): boolean {
  if (header === null) return false;
  const received = Buffer.from(header);
  const expected = Buffer.from(`Bearer ${secret}`);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

/** Daily stale-content scan, then the retention policies. Vercel Cron
 * (vercel.json) calls it with `Authorization: Bearer $CRON_SECRET`; any other
 * scheduler must send the same header. Not behind middleware: the matcher
 * skips /api/. */
export async function GET(request: NextRequest): Promise<NextResponse<CronResponse>> {
  let secret: string;
  try {
    secret = getCronEnv().CRON_SECRET;
  } catch (error) {
    console.error("[api/cron/content-scan] server env invalid:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "server_misconfigured" }, { status: 500 });
  }

  if (!isAuthorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let scan: ContentScanResult;
  try {
    scan = await runContentScan();
  } catch (error) {
    console.error("[api/cron/content-scan] scan failed:", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "scan_failed" }, { status: 500 });
  }

  // After the scan, each as its own step: a retention failure is reported as
  // one (500, so the cron run shows as failed) but cannot undo the scan's
  // notifications, which are already written. The two policies run whatever
  // the other did — the attestation's window is a promise to the people it
  // keeps data on (docs/ATTESTATION.md §11), and one failing must not hold
  // back the other's deletes. Each is skipped inside the database when pg_cron
  // runs it instead — see lib/agents/retention.ts.
  let retention: RetentionResult | null = null;
  try {
    retention = await runRetention();
  } catch (error) {
    console.error(
      `[api/cron/content-scan] retention failed after the scan (created ${scan.created}, skipped ${scan.skipped}):`,
      error instanceof Error ? error.message : String(error)
    );
  }

  let assessmentRetention: AssessmentRetentionResult | null = null;
  try {
    assessmentRetention = await runAssessmentRetention();
  } catch (error) {
    console.error(
      "[api/cron/content-scan] assessment retention failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  if (retention === null) return NextResponse.json({ error: "retention_failed" }, { status: 500 });
  if (assessmentRetention === null) {
    return NextResponse.json({ error: "assessment_retention_failed" }, { status: 500 });
  }
  return NextResponse.json({ ...scan, retention, assessmentRetention }, { headers: { "Cache-Control": "no-store" } });
}
