"use server";
import "server-only";
import type { ActionResult } from "@/lib/admin/errors";
import { adminAttestationRepo } from "@/lib/attestation/repository";
import type { AssessmentConfigWriteInput, ItemWriteInput } from "@/lib/attestation/schemas";
import type { ItemStatus } from "@/lib/attestation/types";
import { requireAdminSession } from "./guard";
import { assessmentAdminActions, type AssessmentAdminDeps } from "./assessment-admin";

// Thin Server Action surface over ./assessment-admin.ts (the same split as
// users.ts over user-access.ts). Every argument is re-validated there with
// zod; the parameter types below are for the caller's editor, not trusted.

const liveDeps: AssessmentAdminDeps = {
  requireSession: requireAdminSession,
  // The admin's own RLS-scoped session (CLAUDE.md §7): 0023's admin-only
  // policies and the admin_assessment_* functions decide again.
  repo: () => adminAttestationRepo(),
};

/** Creates or updates a bank item (version present = update). */
export async function saveAssessmentItem(input: ItemWriteInput): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).saveItem(input);
}

export async function setAssessmentItemStatus(id: string, status: ItemStatus, version: number): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).setItemStatus(id, status, version);
}

export async function deleteAssessmentItem(id: string, version: number): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).deleteItem(id, version);
}

export async function saveAssessmentConfig(input: AssessmentConfigWriteInput): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).saveConfig(input);
}

/** Replaces a submitted attempt's day score (S07's results UI). */
export async function overrideAssessmentScore(input: {
  attemptId: string;
  score: number;
  note: string;
  version: number;
}): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).overrideScore(input);
}

export async function clearAssessmentOverride(input: { attemptId: string; note: string; version: number }): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).clearOverride(input);
}

/** Archives one attempt so the day can be taken again. */
export async function resetAssessmentAttempt(input: { attemptId: string; version: number }): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).resetAttempt(input);
}

/** Archives every open attempt of a person and removes their unlocks. */
export async function resetAssessmentPerson(email: string): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).resetPerson(email);
}

/** Opens day 2–4 for a candidate without the waiting day. */
export async function unlockAssessmentDay(email: string, day: 2 | 3 | 4): Promise<ActionResult> {
  return assessmentAdminActions(liveDeps).unlockDay(email, day);
}
