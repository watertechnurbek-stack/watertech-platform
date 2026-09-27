import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/lib/supabase/database.types";
import { logDbError } from "@/lib/admin/errors";
import { getAssessmentConfig, type LoadedAssessmentConfig } from "./config";
import { assessmentDaySchema, attemptRowSchema, itemRowSchema, type ItemRowWrite } from "./schemas";
import type { ScheduleAttempt } from "./schedule";
import {
  ATTEMPT_STATUSES,
  type AssessmentConfig,
  type AssessmentDay,
  type AssessmentItem,
  type AttemptPhase,
  type AttemptStatus,
  type BandThresholds,
  type DaySettings,
  type DayWeights,
  type ItemStatus,
  type PerDay,
} from "./types";

// The attestation's only way to the database, in two surfaces
// (docs/ATTESTATION.md §13):
//
//   operatorAttestationRepo(email)  — a candidate's own rows, for S05's Route
//       Handlers. The SERVICE-ROLE client: operators and sales managers have no
//       policy on any assessment table, by design. Every query is filtered by
//       the session's email, which arrives as a SessionEmail — a branded string
//       only `sessionEmail(session)` can make, so an email from a request body
//       cannot be passed in without a visible cast. What it returns is server
//       data: a response is built from it by lib/attestation/operator-view.ts
//       and nothing else. The state read selects day, status and submit time —
//       no score leaves Postgres on that path.
//
//   adminAttestationRepo()  — the admin's RLS-scoped session client (admin
//       only, 0023). Item and config writes are version-guarded updates; the
//       attempt writes are the admin_assessment_* functions. A database error is
//       logged here (logDbError) and handed on as its SQLSTATE only.

export type AttestationDbClient = SupabaseClient<Database>;

// === Who is asking =================================================================

declare const SESSION_EMAIL: unique symbol;

/** The verified session's email, lowercased. Only `sessionEmail()` makes one. */
export type SessionEmail = string & { readonly [SESSION_EMAIL]: true };

export function sessionEmail(session: { readonly email: string }): SessionEmail {
  const email = session.email.trim().toLowerCase();
  if (email === "") throw new Error("sessionEmail: the session has no email");
  return email as SessionEmail;
}

// === Write outcomes ================================================================

export type WriteOutcome<T> =
  | { ok: true; value: T }
  /** The database refused; the SQLSTATE decides the AdminErrorCode. */
  | { ok: false; kind: "db"; sqlstate: string | undefined }
  /** A version- or id-guarded write matched no row. */
  | { ok: false; kind: "no_row" };

function dbFailure(scope: string, error: { message: string; code?: string }): { ok: false; kind: "db"; sqlstate: string | undefined } {
  logDbError(scope, error);
  return { ok: false, kind: "db", sqlstate: error.code };
}

function readFailed(scope: string, error: { message: string; code?: string }): Error {
  logDbError(scope, error);
  return new Error(`${scope}: read failed (${error.code ?? "no code"})`);
}

// === The candidate's surface ========================================================

/** An attempt reference for the pace rule and S05 — deliberately scoreless. */
export interface OperatorAttemptRef extends ScheduleAttempt {
  id: string;
  attemptNo: number;
}

const scheduleRowSchema = z.object({
  id: z.string(),
  day: assessmentDaySchema,
  status: z.enum(ATTEMPT_STATUSES),
  attempt_no: z.number().int(),
  submitted_at: z.string().nullable(),
});

/** The only columns the candidate's state read selects. */
export const OPERATOR_SCHEDULE_COLUMNS = "id,day,status,attempt_no,submitted_at";

export interface OperatorAttestationRepo {
  readonly email: SessionEmail;
  /** Every attempt of the person (archived ones too — the schedule skips
   * them), oldest first: day, status, submit time. No score. */
  listScheduleAttempts(): Promise<OperatorAttemptRef[]>;
  /** Days 2–4 the admin opened for the person. */
  listUnlockedDays(): Promise<AssessmentDay[]>;
  /** Items the person was served in archived attempts of `day` — the draw
   * avoids them (lib/attestation/items-draw.ts). */
  listSeenItemIds(day: AssessmentDay): Promise<string[]>;
  /** Whether an attempt is being taken right now (S05 refuses the Copilot). */
  hasAttemptInProgress(): Promise<boolean>;
}

export function operatorAttestationRepo(
  email: SessionEmail,
  // Service-role client (CLAUDE.md §7): a candidate has no policy on the
  // assessment tables, so their own attempt is reached only here — after the
  // Route Handler verified the session — and every query below is filtered by
  // that session's email.
  client: AttestationDbClient = createAdminClient()
): OperatorAttestationRepo {
  return {
    email,

    async listScheduleAttempts() {
      const { data, error } = await client
        .from("assessment_attempts")
        .select(OPERATOR_SCHEDULE_COLUMNS)
        .eq("user_email", email)
        .order("day")
        .order("attempt_no");
      if (error) throw readFailed("assessment_attempts schedule", error);
      const refs: OperatorAttemptRef[] = [];
      for (const row of data) {
        const parsed = scheduleRowSchema.safeParse(row);
        if (!parsed.success) {
          console.error("[attestation] an assessment_attempts row does not parse — skipped");
          continue;
        }
        refs.push({
          id: parsed.data.id,
          day: parsed.data.day,
          status: parsed.data.status,
          attemptNo: parsed.data.attempt_no,
          submittedAt: parsed.data.submitted_at,
        });
      }
      return refs;
    },

    async listUnlockedDays() {
      const { data, error } = await client.from("assessment_unlocks").select("day").eq("user_email", email);
      if (error) throw readFailed("assessment_unlocks", error);
      return data.map((row) => row.day).filter((day): day is AssessmentDay => day === 2 || day === 3 || day === 4);
    },

    async listSeenItemIds(day) {
      const { data, error } = await client
        .from("assessment_attempts")
        .select("item_ids")
        .eq("user_email", email)
        .eq("day", day)
        .eq("status", "archived");
      if (error) throw readFailed("assessment_attempts seen items", error);
      return [...new Set(data.flatMap((row) => row.item_ids))];
    },

    async hasAttemptInProgress() {
      const { count, error } = await client
        .from("assessment_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_email", email)
        .eq("status", "in_progress");
      if (error) throw readFailed("assessment_attempts in progress", error);
      return (count ?? 0) > 0;
    },
  };
}

// === The admin's surface ============================================================

/** One attempt as the results list shows it (admin only). */
export interface AttemptSummary {
  id: string;
  email: string;
  day: AssessmentDay;
  attemptNo: number;
  status: AttemptStatus;
  phase: AttemptPhase;
  startedAt: string;
  submittedAt: string | null;
  partAScore: number | null;
  partBScore: number | null;
  dayScore: number | null;
  overrideScore: number | null;
  needsReview: boolean;
  version: number;
}

/** The settings as the admin's session writes them. */
export interface ConfigPatch {
  weights: PerDay<DayWeights>;
  thresholds: BandThresholds;
  daySettings: PerDay<DaySettings>;
  extraFacts: string;
  extraFactsRu: string;
  retentionDays: number;
}

export interface AdminAttestationRepo {
  listItems(): Promise<AssessmentItem[]>;
  getItem(id: string): Promise<AssessmentItem | null>;
  itemExists(id: string): Promise<boolean>;
  insertItem(row: ItemRowWrite): Promise<WriteOutcome<{ version: number }>>;
  updateItem(id: string, version: number, row: Omit<ItemRowWrite, "id">): Promise<WriteOutcome<{ version: number }>>;
  setItemStatus(id: string, version: number, status: ItemStatus): Promise<WriteOutcome<{ version: number }>>;
  deleteItem(id: string, version: number): Promise<WriteOutcome<null>>;
  getConfig(): Promise<LoadedAssessmentConfig>;
  updateConfig(version: number, patch: ConfigPatch): Promise<WriteOutcome<{ version: number }>>;
  /** Every attempt that still counts (archived ones left out), newest submit first. */
  listAttemptSummaries(): Promise<AttemptSummary[]>;
  override(input: { attemptId: string; score: number; note: string; version: number }): Promise<WriteOutcome<{ version: number }>>;
  clearOverride(input: { attemptId: string; note: string; version: number }): Promise<WriteOutcome<{ version: number }>>;
  resetAttempt(input: { attemptId: string; version: number }): Promise<WriteOutcome<null>>;
  resetPerson(email: string): Promise<WriteOutcome<{ attemptsArchived: number; unlocksRemoved: number }>>;
  unlockDay(email: string, day: Exclude<AssessmentDay, 1>): Promise<WriteOutcome<{ created: boolean }>>;
}

const ITEM_COLUMNS =
  "id,day,topic,kind,difficulty,prompt,prompt_ru,options,answer_key,explanation,explanation_ru,source_ref,status,version,created_at,updated_at,updated_by";

const ATTEMPT_SUMMARY_COLUMNS =
  "id,user_email,day,attempt_no,status,phase,started_at,submitted_at,part_a_score,part_b_score,day_score,override_score,needs_review,version";

function toItem(row: unknown): AssessmentItem | null {
  const parsed = itemRowSchema.safeParse(row);
  if (!parsed.success) {
    console.error("[attestation] an assessment_items row does not parse — skipped");
    return null;
  }
  const item = parsed.data;
  return {
    id: item.id,
    day: item.day,
    topic: item.topic,
    kind: item.kind,
    difficulty: item.difficulty,
    prompt: item.prompt,
    promptRu: item.prompt_ru,
    options: item.options.map((option) => ({ id: option.id, text: option.text, textRu: option.text_ru ?? null })),
    answerKey: item.answer_key,
    explanation: item.explanation,
    explanationRu: item.explanation_ru,
    sourceRef: item.source_ref,
    status: item.status,
    version: item.version,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    updatedBy: item.updated_by,
  };
}

function perDayJson<T>(perDay: PerDay<T>, toJson: (value: T) => Json): Json {
  return { "1": toJson(perDay[1]), "2": toJson(perDay[2]), "3": toJson(perDay[3]), "4": toJson(perDay[4]) };
}

function configRow(patch: ConfigPatch) {
  return {
    weights: perDayJson(patch.weights, (weights) => ({ partA: weights.partA, partB: weights.partB })),
    thresholds: { green: patch.thresholds.green, yellow: patch.thresholds.yellow },
    day_settings: perDayJson(patch.daySettings, (settings) => ({
      itemCount: settings.itemCount,
      itemSeconds: settings.itemSeconds,
      minTurns: settings.minTurns,
      maxTurns: settings.maxTurns,
      partBMinutes: settings.partBMinutes,
    })),
    extra_facts: patch.extraFacts,
    extra_facts_ru: patch.extraFactsRu,
    retention_days: patch.retentionDays,
  };
}

const resetPersonResultSchema = z.object({
  attempts_archived: z.number().int(),
  unlocks_removed: z.number().int(),
});

export function adminAttestationRepo(
  // The admin's own session, under RLS (admin only, 0023) — never the service role.
  client: AttestationDbClient = createClient()
): AdminAttestationRepo {
  return {
    async listItems() {
      const { data, error } = await client
        .from("assessment_items")
        .select(ITEM_COLUMNS)
        .order("day")
        .order("topic")
        .order("id");
      if (error) throw readFailed("assessment_items list", error);
      return data.map(toItem).filter((item): item is AssessmentItem => item !== null);
    },

    async getItem(id) {
      const { data, error } = await client.from("assessment_items").select(ITEM_COLUMNS).eq("id", id).limit(1);
      if (error) throw readFailed("assessment_items get", error);
      const [row] = data;
      return row === undefined ? null : toItem(row);
    },

    async itemExists(id) {
      const { data, error } = await client.from("assessment_items").select("id").eq("id", id).limit(1);
      if (error) throw readFailed("assessment_items exists", error);
      return data.length > 0;
    },

    async insertItem(row) {
      const { data, error } = await client.from("assessment_items").insert(row).select("version");
      if (error) return dbFailure("assessment_items insert", error);
      const [written] = data;
      return written ? { ok: true, value: { version: written.version } } : { ok: false, kind: "no_row" };
    },

    async updateItem(id, version, row) {
      const { data, error } = await client
        .from("assessment_items")
        .update(row)
        .eq("id", id)
        .eq("version", version)
        .select("version");
      if (error) return dbFailure("assessment_items update", error);
      const [written] = data;
      return written ? { ok: true, value: { version: written.version } } : { ok: false, kind: "no_row" };
    },

    async setItemStatus(id, version, status) {
      const { data, error } = await client
        .from("assessment_items")
        .update({ status })
        .eq("id", id)
        .eq("version", version)
        .select("version");
      if (error) return dbFailure("assessment_items status", error);
      const [written] = data;
      return written ? { ok: true, value: { version: written.version } } : { ok: false, kind: "no_row" };
    },

    async deleteItem(id, version) {
      const { data, error } = await client
        .from("assessment_items")
        .delete()
        .eq("id", id)
        .eq("version", version)
        .select("id");
      if (error) return dbFailure("assessment_items delete", error);
      return data.length > 0 ? { ok: true, value: null } : { ok: false, kind: "no_row" };
    },

    getConfig() {
      return getAssessmentConfig(client);
    },

    async updateConfig(version, patch) {
      const { data, error } = await client
        .from("assessment_config")
        .update(configRow(patch))
        .eq("id", 1)
        .eq("version", version)
        .select("version");
      if (error) return dbFailure("assessment_config update", error);
      const [written] = data;
      return written ? { ok: true, value: { version: written.version } } : { ok: false, kind: "no_row" };
    },

    async listAttemptSummaries() {
      const { data, error } = await client
        .from("assessment_attempts")
        .select(ATTEMPT_SUMMARY_COLUMNS)
        .neq("status", "archived")
        .order("submitted_at", { ascending: false, nullsFirst: false })
        .order("started_at", { ascending: false });
      if (error) throw readFailed("assessment_attempts summaries", error);
      const summaries: AttemptSummary[] = [];
      for (const row of data) {
        const parsed = attemptRowSchema.safeParse(row);
        if (!parsed.success) {
          console.error("[attestation] an assessment_attempts row does not parse — skipped");
          continue;
        }
        const attempt = parsed.data;
        summaries.push({
          id: attempt.id,
          email: attempt.user_email,
          day: attempt.day,
          attemptNo: attempt.attempt_no,
          status: attempt.status,
          phase: attempt.phase,
          startedAt: attempt.started_at,
          submittedAt: attempt.submitted_at,
          partAScore: attempt.part_a_score,
          partBScore: attempt.part_b_score,
          dayScore: attempt.day_score,
          overrideScore: attempt.override_score,
          needsReview: attempt.needs_review,
          version: attempt.version,
        });
      }
      return summaries;
    },

    async override({ attemptId, score, note, version }) {
      const { data, error } = await client.rpc("admin_assessment_override", {
        p_attempt: attemptId,
        p_score: score,
        p_note: note,
        p_version: version,
      });
      if (error) return dbFailure("admin_assessment_override", error);
      return { ok: true, value: { version: data } };
    },

    async clearOverride({ attemptId, note, version }) {
      const { data, error } = await client.rpc("admin_assessment_clear_override", {
        p_attempt: attemptId,
        p_note: note,
        p_version: version,
      });
      if (error) return dbFailure("admin_assessment_clear_override", error);
      return { ok: true, value: { version: data } };
    },

    async resetAttempt({ attemptId, version }) {
      const { error } = await client.rpc("admin_assessment_reset", { p_attempt: attemptId, p_version: version });
      if (error) return dbFailure("admin_assessment_reset", error);
      return { ok: true, value: null };
    },

    async resetPerson(email) {
      const { data, error } = await client.rpc("admin_assessment_reset_person", { p_email: email });
      if (error) return dbFailure("admin_assessment_reset_person", error);
      const parsed = resetPersonResultSchema.safeParse(data);
      if (!parsed.success) {
        console.error("[attestation] admin_assessment_reset_person answered an unexpected shape");
        return { ok: true, value: { attemptsArchived: 0, unlocksRemoved: 0 } };
      }
      return {
        ok: true,
        value: { attemptsArchived: parsed.data.attempts_archived, unlocksRemoved: parsed.data.unlocks_removed },
      };
    },

    async unlockDay(email, day) {
      const { data, error } = await client.rpc("admin_assessment_unlock", { p_email: email, p_day: day });
      if (error) return dbFailure("admin_assessment_unlock", error);
      return { ok: true, value: { created: data } };
    },
  };
}

/** Published items per day and what the day needs — the bank's readiness
 * (S05 refuses to start a day whose bank is short). */
export function bankReadiness(
  items: readonly Pick<AssessmentItem, "day" | "status">[],
  config: Pick<AssessmentConfig, "daySettings">
): PerDay<{ published: number; needed: number }> {
  const published = (day: AssessmentDay): number =>
    items.filter((item) => item.day === day && item.status === "published").length;
  return {
    1: { published: published(1), needed: config.daySettings[1].itemCount },
    2: { published: published(2), needed: config.daySettings[2].itemCount },
    3: { published: published(3), needed: config.daySettings[3].itemCount },
    4: { published: published(4), needed: config.daySettings[4].itemCount },
  };
}
