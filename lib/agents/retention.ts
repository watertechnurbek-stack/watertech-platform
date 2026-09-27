import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";

// Service-role client (CLAUDE.md section 7): public.run_retention() (0016) and
// public.run_assessment_retention() (0023) prune tables across every user,
// including rows no session role may delete, and EXECUTE on them is granted to
// service_role alone. They are called from the cron Route Handler, which has no
// user session at all.

export type RetentionResult = Database["public"]["Functions"]["run_retention"]["Returns"][number];
export type AssessmentRetentionResult =
  Database["public"]["Functions"]["run_assessment_retention"]["Returns"][number];

/** The daily retention policy (the numbers live in the SQL function only).
 * When 0016 found pg_cron and scheduled the job itself, the database already
 * runs it: the call then returns `skipped: true` and deletes nothing, so the
 * policy runs once a day whichever scheduler this project has. */
export async function runRetention(): Promise<RetentionResult> {
  const { data, error } = await createAdminClient().rpc("run_retention", { p_skip_if_scheduled: true });
  if (error) throw new Error(`run_retention: ${error.code ?? ""} ${error.message}`);
  const [row] = data ?? [];
  if (!row) throw new Error("run_retention: no result row");
  return row;
}

/** The attestation's retention (0023, docs/ATTESTATION.md §11): attempts
 * started more than `assessment_config.retention_days` ago go, their
 * conversations with them (cascade), and unlocks older than the same window.
 * The window lives in the config row the admin edits, not here. Skipped inside
 * the database, like runRetention, when 0023 scheduled its own pg_cron job. */
export async function runAssessmentRetention(): Promise<AssessmentRetentionResult> {
  const { data, error } = await createAdminClient().rpc("run_assessment_retention", { p_skip_if_scheduled: true });
  if (error) throw new Error(`run_assessment_retention: ${error.code ?? ""} ${error.message}`);
  const [row] = data ?? [];
  if (!row) throw new Error("run_assessment_retention: no result row");
  return row;
}
