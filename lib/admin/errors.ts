import { ZodError } from "zod";
import type { GateResult } from "@/lib/agents/publish-gate/types";
import { VALIDATION_DETAIL_LIMIT } from "@/lib/admin/validation";

/** Why an admin write failed, as a code rather than a sentence. The client
 * turns it into copy through `admin.errors.<code>` (messages/uz.json and
 * messages/ru.json), which is what makes the Russian admin read Russian —
 * a Server Action has no business picking the locale's wording.
 *
 * - `unauthorized`      — not a signed-in admin (requireAdminSession threw).
 * - `validation`        — zod rejected the input; see `field` / `details`.
 * - `id_taken`          — creating a row whose id already exists (Postgres 23505).
 * - `version_conflict`  — someone saved first; the write matched no row.
 * - `gate_blocked`      — the publish gate refused; `gate` carries its report.
 * - `not_found`         — the row (or version snapshot) is gone.
 * - `reference_in_use`  — another row still points at this one (delete guard, S07).
 * - `email_taken`       — adding an allow-list email that already has a row (/admin/users).
 * - `last_admin`        — the change would leave no active admin (SQL WT460, 0017/0020).
 * - `self_change`       — an admin demoting, deactivating or removing their own row, or
 *                         purging their own history (SQL WT461, 0017/0022).
 * - `admin_locked`      — the change creates, promotes, demotes, deactivates or removes an
 *                         admin row, or purges its history; admin rows are SQL-editor-only
 *                         (SQL WT462, 0020/0022).
 * - `auth_sync_failed`  — the allow-list row was written, but Supabase Auth did not confirm
 *                         the matching ban / unban; repeating the action retries it. On a
 *                         removal Auth comes first: it did not confirm deleting the account,
 *                         and nothing else was changed.
 * - `unknown`           — anything else; the real cause is in the server log.
 */
export type AdminErrorCode =
  | "unauthorized"
  | "validation"
  | "id_taken"
  | "version_conflict"
  | "gate_blocked"
  | "not_found"
  | "reference_in_use"
  | "email_taken"
  | "last_admin"
  | "self_change"
  | "admin_locked"
  | "auth_sync_failed"
  | "unknown";

/** Why a delete was refused or needs confirming. `block`: live rows point at
 * this one through an id with no foreign key behind it, so deleting would
 * leave them dangling. `cascade`: the database deletes those rows along with
 * this one, which the admin confirms explicitly (see `ContentActions.remove`). */
export type ReferenceMode = "block" | "cascade";

/** The rows behind a `reference_in_use`, per referencing table — what the
 * delete dialog names. `titles` is capped by the guard that produced it
 * (REFERENCE_TITLE_LIMIT in lib/admin/registry.ts); `count` is how many there
 * really are. Row titles are content an admin wrote, never database error
 * text. */
export interface ReferenceSummary {
  table: string;
  mode: ReferenceMode;
  titles: string[];
  count: number;
}

/** What every admin Server Action returns. There is deliberately no `message`
 * field: a raw Postgres error tells an attacker the schema and tells an admin
 * nothing, so it goes to console.error (see `logDbError`) and never to the
 * browser.
 *
 * `field` is the input path the failure is about (`"stages.0.id"`), and
 * `details` are validation keys (lib/admin/validation.ts) or literal values
 * such as an unresolved content id — never text from the database.
 * `references` is the structured form of a `reference_in_use` (`details`
 * carries the same titles flattened, for the generic error line). */
export type ActionResult =
  | { ok: true }
  | {
      ok: false;
      code: AdminErrorCode;
      gate?: GateResult;
      field?: string;
      details?: string[];
      references?: ReferenceSummary[];
    };

/** The failing half of an ActionResult — what hooks/useActionError.ts turns
 * into copy once `result.ok` has been checked. */
export type ActionFailure = Extract<ActionResult, { ok: false }>;

/** A failure a Server Action throws on its way out of a helper, so the helper
 * doesn't have to thread an ActionResult back through every caller. Caught by
 * `actionErrorResult` at the action boundary. */
export class AdminActionError extends Error {
  constructor(
    readonly code: AdminErrorCode,
    readonly field?: string,
    readonly details?: string[]
  ) {
    // The message is for the server log only — the client reads `code`.
    super(`admin action failed: ${code}`);
    this.name = "AdminActionError";
  }
}

export function actionOk(): ActionResult {
  return { ok: true };
}

export function actionFailed(
  code: AdminErrorCode,
  extra?: { field?: string; details?: string[]; gate?: GateResult; references?: ReferenceSummary[] }
): ActionResult {
  return { ok: false, code, ...extra };
}

/** A delete the reference guard stopped. The titles are flattened into
 * `details` as well, so a caller that only renders the generic error line
 * still names the rows involved. */
export function referenceInUseResult(references: ReferenceSummary[]): ActionResult {
  return {
    ok: false,
    code: "reference_in_use",
    details: references.flatMap((reference) => reference.titles),
    references,
  };
}

/** `gate` is set only when the publish gate blocked the write — the client
 * shows its report in a dialog (components/admin/GateReportDialog.tsx). */
export function gateBlockedResult(gate: GateResult): ActionResult {
  return { ok: false, code: "gate_blocked", gate };
}

/** The one place a database error is allowed to be read. It is logged with the
 * operation that produced it and collapsed into a code; the message, hint and
 * details stay on the server. */
export function logDbError(scope: string, error: { message: string; code?: string }): void {
  console.error(`[admin] ${scope}:`, error.code ?? "", error.message);
}

/** Postgres unique-violation — a create whose id is already taken. */
export const PG_UNIQUE_VIOLATION = "23505";
/** Postgres foreign-key violation — a delete another table still references. */
export const PG_FOREIGN_KEY_VIOLATION = "23503";

/** The refusals of private.allowed_users_guard (0017, admin semantics since
 * 0020) and of admin_purge_person_history (0022), mapped by SQLSTATE — never
 * by message, which stays in the server log. Null for any other state: the
 * caller decides what that means. */
export function allowListGuardCode(sqlstate: string | undefined): AdminErrorCode | null {
  switch (sqlstate) {
    case "WT403": // the JWT's email is no longer an active admin row (a stale token)
      return "unauthorized";
    case "WT460":
      return "last_admin";
    case "WT461":
      return "self_change";
    case "WT462":
      return "admin_locked";
    default:
      return null;
  }
}

/** The refusals of the attestation's admin writes (0023): the
 * admin_assessment_* functions, the item and config CHECK constraints and RLS.
 * By SQLSTATE, never by message. */
export function assessmentDbCode(sqlstate: string | undefined): AdminErrorCode {
  switch (sqlstate) {
    case "WT403": // the claim, or the caller's own allow-list row, is not an active admin
    case "42501": // no privilege, or a row the admin-only policies refuse
      return "unauthorized";
    case "WT400":
    case "23514": // a CHECK: a publish rule, a config shape
      return "validation";
    case "WT404":
      return "not_found";
    case "WT409": // the attempt changed since it was read
      return "version_conflict";
    case PG_UNIQUE_VIOLATION:
      return "id_taken";
    default:
      return "unknown";
  }
}

function zodResult(error: ZodError): ActionResult {
  const [first] = error.issues;
  return {
    ok: false,
    code: "validation",
    field: first && first.path.length > 0 ? first.path.join(".") : undefined,
    details: [...new Set(error.issues.map((issue) => issue.message))].slice(0, VALIDATION_DETAIL_LIMIT),
  };
}

/** Turns whatever an action body threw into a typed result. Anything that is
 * not a recognised admin failure is logged and reported as `unknown`: the
 * stack may name a table, a column or a constraint, and none of that belongs
 * in a browser. */
export function actionErrorResult(error: unknown): ActionResult {
  if (error instanceof AdminActionError) {
    return { ok: false, code: error.code, field: error.field, details: error.details };
  }
  if (error instanceof ZodError) return zodResult(error);
  console.error("[admin] unhandled action error:", error);
  return { ok: false, code: "unknown" };
}
