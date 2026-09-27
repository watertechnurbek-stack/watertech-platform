"use server";
import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAdminSession } from "@/lib/admin/actions/guard";
import { actionErrorResult, actionFailed, actionOk, gateBlockedResult, type ActionResult } from "@/lib/admin/errors";
import { isContentTable } from "@/lib/admin/registry";
import { idSchema } from "@/lib/admin/schemas";
import { adminErrorMap } from "@/lib/admin/validation";
import { runPublishGate } from "@/lib/agents/publish-gate";
import { updateWithVersion } from "@/lib/admin/actions/concurrency";
import { revalidateContent } from "@/lib/content/revalidate";
import { DASHBOARD_TABLE_KIND } from "@/lib/dashboard/content-health";
import type { DynamicTablesDatabase } from "@/lib/supabase/typed";
import type { Json } from "@/lib/supabase/database.types";

/** The row a quick action targets — the same shape factory.setStatus parses
 * for a list-page publish. The arguments come from the browser, so the TS
 * signatures below are not a check (CLAUDE.md §7). */
const rowRefSchema = z.object({
  id: idSchema,
  expectedVersion: z.number().int().nonnegative(),
});

async function writeAndRevalidate(
  table: string,
  id: string,
  expectedVersion: number,
  patch: { [key: string]: Json | undefined },
  session: { email: string }
): Promise<ActionResult> {
  if (!isContentTable(table)) return actionFailed("validation", { field: "table" });
  const ref = rowRefSchema.parse({ id, expectedVersion }, { errorMap: adminErrorMap });
  await updateWithVersion(
    createClient<DynamicTablesDatabase>(),
    table,
    ref.id,
    { ...patch, updated_by: session.email },
    ref.expectedVersion
  );
  revalidateContent(DASHBOARD_TABLE_KIND[table]);
  revalidatePath("/[locale]/(admin)/admin/knowledge", "page");
  return actionOk();
}

export async function publishFromDashboard(table: string, id: string, expectedVersion: number): Promise<ActionResult> {
  try {
    const session = await requireAdminSession();
    if (!isContentTable(table)) return actionFailed("validation", { field: "table" });
    // Before the gate: a gate run on a malformed id still writes a gate report
    // and a "publish blocked" notification naming it.
    const ref = rowRefSchema.parse({ id, expectedVersion }, { errorMap: adminErrorMap });
    const gate = await runPublishGate({ table, id: ref.id, actor: session.email });
    if (!gate.passed) return gateBlockedResult(gate);
    return await writeAndRevalidate(table, ref.id, ref.expectedVersion, { status: "published" }, session);
  } catch (e) {
    return actionErrorResult(e);
  }
}

export async function unpublishFromDashboard(table: string, id: string, expectedVersion: number): Promise<ActionResult> {
  try {
    const session = await requireAdminSession();
    return await writeAndRevalidate(table, id, expectedVersion, { status: "draft" }, session);
  } catch (e) {
    return actionErrorResult(e);
  }
}

/** No-op update — its only effect is `updated_by` (and, via the BEFORE
 * UPDATE trigger, `updated_at`/`version`) so the admin can clear an item off
 * the "stale" list after confirming its content is still accurate, without
 * having to open the editor and re-save every field. */
export async function touchContent(table: string, id: string, expectedVersion: number): Promise<ActionResult> {
  try {
    const session = await requireAdminSession();
    return await writeAndRevalidate(table, id, expectedVersion, {}, session);
  } catch (e) {
    return actionErrorResult(e);
  }
}
