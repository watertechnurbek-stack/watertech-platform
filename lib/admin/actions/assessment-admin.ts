import "server-only";
import {
  actionErrorResult,
  actionFailed,
  actionOk,
  assessmentDbCode,
  type ActionResult,
} from "@/lib/admin/errors";
import { adminErrorMap } from "@/lib/admin/validation";
import type { AdminAttestationRepo, WriteOutcome } from "@/lib/attestation/repository";
import {
  PUBLISH_RULE_KEYS,
  assessmentConfigWriteSchema,
  clearOverrideInputSchema,
  itemDeleteSchema,
  itemPublishIssues,
  itemStatusChangeSchema,
  itemWriteSchema,
  itemWriteToRow,
  overrideInputSchema,
  resetAttemptInputSchema,
  resetPersonInputSchema,
  unlockDayInputSchema,
} from "@/lib/attestation/schemas";
import type { AdminSession } from "./guard";

// The attestation's admin writes (docs/ATTESTATION.md §13, §17). Not a
// "use server" file, like factory.ts / user-access.ts: the dependencies come
// in as an argument, so tests/unit/admin/assessment-admin.test.ts drives the
// real repository over a real supabase-js client and a mocked fetch.
// lib/admin/actions/assessments.ts is the Server Action surface.
//
// Every argument is browser input whatever its TS type (CLAUDE.md §7): each
// action runs requireSession() first, then zod, then the write. Items and
// config are version-guarded updates through the admin's RLS session; the
// attempt writes are the admin_assessment_* functions, which re-check the
// admin themselves. A database refusal comes back as an AdminErrorCode by
// SQLSTATE (assessmentDbCode), never as its message.

export interface AssessmentAdminDeps {
  /** Throws (AdminActionError "unauthorized") unless the caller is an admin. */
  requireSession: () => Promise<AdminSession>;
  /** The admin's RLS-scoped repository — never the service role. */
  repo: () => AdminAttestationRepo;
}

export interface AssessmentAdminActions {
  /** Creates (no version) or updates (with the version the editor loaded) an
   * item; a published status runs the publish rules first. */
  saveItem: (input: unknown) => Promise<ActionResult>;
  /** Publishes (after the publish rules, on the stored row) or unpublishes. */
  setItemStatus: (id: unknown, status: unknown, version: unknown) => Promise<ActionResult>;
  deleteItem: (id: unknown, version: unknown) => Promise<ActionResult>;
  saveConfig: (input: unknown) => Promise<ActionResult>;
  overrideScore: (input: unknown) => Promise<ActionResult>;
  clearOverride: (input: unknown) => Promise<ActionResult>;
  resetAttempt: (input: unknown) => Promise<ActionResult>;
  resetPerson: (email: unknown) => Promise<ActionResult>;
  unlockDay: (email: unknown, day: unknown) => Promise<ActionResult>;
}

function failed<T>(outcome: Exclude<WriteOutcome<T>, { ok: true }>, noRow: "version_conflict" | "not_found"): ActionResult {
  return actionFailed(outcome.kind === "db" ? assessmentDbCode(outcome.sqlstate) : noRow);
}

export function assessmentAdminActions(deps: AssessmentAdminDeps): AssessmentAdminActions {
  /** A version-guarded write that matched nothing: the row changed, or is gone. */
  async function missedItem(repo: AdminAttestationRepo, id: string): Promise<ActionResult> {
    return actionFailed((await repo.itemExists(id)) ? "version_conflict" : "not_found");
  }

  async function saveItem(input: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const item = itemWriteSchema.parse(input, { errorMap: adminErrorMap });
      const repo = deps.repo();
      const row = itemWriteToRow(item);

      if (item.version === undefined) {
        const created = await repo.insertItem(row);
        return created.ok ? actionOk() : failed(created, "not_found");
      }

      const { id, ...content } = row;
      const updated = await repo.updateItem(id, item.version, content);
      if (updated.ok) return actionOk();
      return updated.kind === "no_row" ? await missedItem(repo, id) : failed(updated, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function setItemStatus(id: unknown, status: unknown, version: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const change = itemStatusChangeSchema.parse({ id, status, version }, { errorMap: adminErrorMap });
      const repo = deps.repo();

      // Publishing checks the row as it is stored — not what a stale list
      // row showed. The database checks it once more (CHECK constraint).
      if (change.status === "published") {
        const stored = await repo.getItem(change.id);
        if (!stored) return actionFailed("not_found");
        if (stored.version !== change.version) return actionFailed("version_conflict");
        const issues = itemPublishIssues(stored);
        if (issues.length > 0) {
          return actionFailed("validation", { field: "status", details: issues.map((rule) => PUBLISH_RULE_KEYS[rule]) });
        }
      }

      const written = await repo.setItemStatus(change.id, change.version, change.status);
      if (written.ok) return actionOk();
      return written.kind === "no_row" ? await missedItem(repo, change.id) : failed(written, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function deleteItem(id: unknown, version: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const target = itemDeleteSchema.parse({ id, version }, { errorMap: adminErrorMap });
      const repo = deps.repo();
      // Attempts keep their own snapshot of every item they served, so a
      // delete never changes a result (docs/ATTESTATION.md §8).
      const deleted = await repo.deleteItem(target.id, target.version);
      if (deleted.ok) return actionOk();
      return deleted.kind === "no_row" ? await missedItem(repo, target.id) : failed(deleted, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function saveConfig(input: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const config = assessmentConfigWriteSchema.parse(input, { errorMap: adminErrorMap });
      const written = await deps.repo().updateConfig(config.version, {
        weights: config.weights,
        thresholds: config.thresholds,
        daySettings: config.daySettings,
        extraFacts: config.extraFacts,
        extraFactsRu: config.extraFactsRu,
        retentionDays: config.retentionDays,
      });
      // The row always exists (0023 inserts it); a miss is someone else's save.
      return written.ok ? actionOk() : failed(written, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function overrideScore(input: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const override = overrideInputSchema.parse(input, { errorMap: adminErrorMap });
      const written = await deps.repo().override(override);
      return written.ok ? actionOk() : failed(written, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function clearOverride(input: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const clear = clearOverrideInputSchema.parse(input, { errorMap: adminErrorMap });
      const written = await deps.repo().clearOverride(clear);
      return written.ok ? actionOk() : failed(written, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function resetAttempt(input: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const reset = resetAttemptInputSchema.parse(input, { errorMap: adminErrorMap });
      const written = await deps.repo().resetAttempt(reset);
      return written.ok ? actionOk() : failed(written, "version_conflict");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function resetPerson(email: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const target = resetPersonInputSchema.parse({ email }, { errorMap: adminErrorMap });
      const written = await deps.repo().resetPerson(target.email);
      return written.ok ? actionOk() : failed(written, "not_found");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  async function unlockDay(email: unknown, day: unknown): Promise<ActionResult> {
    try {
      await deps.requireSession();
      const target = unlockDayInputSchema.parse({ email, day }, { errorMap: adminErrorMap });
      const written = await deps.repo().unlockDay(target.email, target.day);
      return written.ok ? actionOk() : failed(written, "not_found");
    } catch (e) {
      return actionErrorResult(e);
    }
  }

  return {
    saveItem,
    setItemStatus,
    deleteItem,
    saveConfig,
    overrideScore,
    clearOverride,
    resetAttempt,
    resetPerson,
    unlockDay,
  };
}
