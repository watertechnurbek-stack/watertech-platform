import { z } from "zod";
import type { Json } from "@/lib/supabase/database.types";
import type { ValidationKey } from "@/lib/admin/validation";
import { userEmailSchema } from "@/lib/admin/users";
import {
  ATTEMPT_PHASES,
  ATTEMPT_STATUSES,
  ITEM_KINDS,
  ITEM_STATUSES,
  SOURCE_REF_KINDS,
  isAssessmentDay,
  isItemDifficulty,
  type AssessmentDay,
  type ItemDifficulty,
  type ItemKind,
} from "./types";

// Every boundary of the attestation, in zod (CLAUDE.md §5): the admin's item
// and settings forms (client and Server Action alike), the admin RPC inputs,
// every body S05's candidate API accepts, and the JSON stored in the attempt
// columns. Client-safe: nothing here is secret — it describes shapes, not
// results. Messages are admin.validation keys (lib/admin/validation.ts), the
// same contract as lib/admin/schemas.ts.
//
// The limits mirror the CHECK constraints of 0023_attestation.sql, and
// tests/unit/attestation/schemas.test.ts reads that file to keep them equal.
// Where a rule exists on both sides the TS one is never weaker: the database
// only guarantees that no path stores what the app could not parse.

// === Limits ========================================================================

/** A candidate's Part B message (assessment_messages_operator_len_chk). */
export const OPERATOR_MESSAGE_MAX_CHARS = 600;
/** Each of the admin's extra-facts fields (assessment_config_extra_facts_chk). */
export const EXTRA_FACTS_MAX_CHARS = 8000;
/** An override or clear note (assessment_attempts_override_note_chk). */
export const OVERRIDE_NOTE_MAX_CHARS = 1000;

export const ITEM_LIMITS = {
  /** A prompt while drafting, and to publish. */
  promptDraft: 1000,
  promptPublish: 400,
  /** An option while drafting, and to publish. */
  optionDraft: 400,
  optionPublish: 160,
  explanation: 2000,
  minOptions: 2,
  maxOptions: 6,
} as const;

export const RETENTION_DAYS_RANGE = { min: 30, max: 3650 } as const;

/** Inclusive ranges of the per-day settings (private.assessment_day_settings_valid). */
export const DAY_SETTING_RANGES = {
  itemCount: { min: 1, max: 30 },
  itemSeconds: { min: 15, max: 300 },
  minTurns: { min: 2, max: 30 },
  maxTurns: { min: 2, max: 40 },
  partBMinutes: { min: 5, max: 60 },
} as const;

/** assessment_items_id_chk / _topic_chk / the option id rule of
 * private.assessment_options_valid / assessment_items_source_ref_chk. */
export const ITEM_ID_PATTERN = /^[a-z0-9-]{1,80}$/;
export const TOPIC_PATTERN = /^[a-z0-9-]{1,40}$/;
export const OPTION_ID_PATTERN = /^[a-z0-9]{1,8}$/;
export const SOURCE_REF_PATTERN = new RegExp(`^(${SOURCE_REF_KINDS.join("|")}):[a-z0-9-]{1,80}$`);

// === Building blocks ================================================================

export const assessmentDaySchema = z
  .number({ invalid_type_error: "invalid" })
  .refine((value): value is AssessmentDay => isAssessmentDay(value), { message: "invalid" });

export const itemDifficultySchema = z
  .number({ invalid_type_error: "invalid" })
  .refine((value): value is ItemDifficulty => isItemDifficulty(value), { message: "invalid" });

/** An integer in [min, max] — every number of the settings form. */
function intInRange(min: number, max: number) {
  return z
    .number({ invalid_type_error: "number", required_error: "required" })
    .int("number")
    .min(min, "outOfRange")
    .max(max, "outOfRange");
}

/** The item editor's create segment (/admin/assessments/items/new) — never an
 * item id, or that item could not be opened. */
export const NEW_ITEM_ID = "new";

export const itemIdSchema = z
  .string()
  .trim()
  .min(1, "required")
  .regex(ITEM_ID_PATTERN, "slug")
  .refine((id) => id !== NEW_ITEM_ID, "invalid");
export const optionIdSchema = z.string().regex(OPTION_ID_PATTERN, "invalid");
export const attemptIdSchema = z.string().uuid("invalid");
export const versionSchema = z.number({ invalid_type_error: "invalid" }).int("invalid").positive("invalid");

/** Four days, keyed "1"–"4" like the JSON columns. String keys, so the
 * settings form's field paths ("weights.1.partA") type-check — TypeScript
 * reads `config.weights[day]` with a numeric day the same either way. */
function perDaySchema<T extends z.ZodTypeAny>(schema: T) {
  return z.object({ "1": schema, "2": schema, "3": schema, "4": schema }).strict();
}

// === Items ==========================================================================

export const itemOptionInputSchema = z.object({
  id: optionIdSchema,
  text: z.string().trim().min(1, "required").max(ITEM_LIMITS.optionDraft, "tooLong"),
  /** "" when there is no Russian text yet (a draft). */
  textRu: z.string().trim().max(ITEM_LIMITS.optionDraft, "tooLong"),
  correct: z.boolean(),
});

export type ItemOptionInput = z.infer<typeof itemOptionInputSchema>;

/** What a publish check reads. The editor derives `answerKey` from the
 * options' "correct" boxes; a stored row carries it as a column. */
export interface ItemPublishInput {
  kind: ItemKind;
  prompt: string;
  promptRu: string | null;
  options: readonly { id: string; text: string; textRu: string | null }[];
  answerKey: readonly string[];
  explanation: string | null;
  explanationRu: string | null;
}

export const ITEM_PUBLISH_RULES = [
  "optionsCount",
  "keyInOptions",
  "keyCount",
  "bothLocales",
  "promptLength",
  "optionLength",
  "uniqueOptions",
] as const;
export type ItemPublishRule = (typeof ITEM_PUBLISH_RULES)[number];

/** The admin.validation key a failed rule is reported under. */
export const PUBLISH_RULE_KEYS = {
  optionsCount: "publishOptionsCount",
  keyInOptions: "publishKeyInOptions",
  keyCount: "publishKeyCount",
  bothLocales: "publishBothLocales",
  promptLength: "publishPromptLength",
  optionLength: "publishOptionLength",
  uniqueOptions: "publishUniqueOptions",
} as const satisfies Record<ItemPublishRule, ValidationKey>;

export interface ItemPublishCheck {
  rule: ItemPublishRule;
  ok: boolean;
}

const filled = (value: string | null | undefined): value is string => typeof value === "string" && value.trim() !== "";

/** The duplicate-option comparison: whitespace collapsed, trimmed, case folded.
 * The database's twin (inside private.assessment_item_publishable) does not
 * fold case, so it is never stricter than this. */
export function normalizeOptionText(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function allDistinct(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

/** The publish rules (docs/ATTESTATION.md §10), one result per rule, in
 * ITEM_PUBLISH_RULES order — the editor shows them as a live checklist, the
 * Server Action refuses a publish while any fails. */
export function itemPublishChecks(item: ItemPublishInput): ItemPublishCheck[] {
  const optionIds = item.options.map((option) => option.id);
  const results: Record<ItemPublishRule, boolean> = {
    optionsCount: item.options.length >= ITEM_LIMITS.minOptions && item.options.length <= ITEM_LIMITS.maxOptions,
    keyInOptions: allDistinct([...item.answerKey]) && item.answerKey.every((id) => optionIds.includes(id)),
    keyCount: item.kind === "single" ? item.answerKey.length === 1 : item.answerKey.length >= 1,
    bothLocales:
      filled(item.prompt) &&
      filled(item.promptRu) &&
      item.options.every((option) => filled(option.text) && filled(option.textRu)) &&
      filled(item.explanation) === filled(item.explanationRu),
    promptLength:
      item.prompt.trim().length <= ITEM_LIMITS.promptPublish &&
      (item.promptRu ?? "").trim().length <= ITEM_LIMITS.promptPublish,
    optionLength: item.options.every(
      (option) =>
        option.text.trim().length <= ITEM_LIMITS.optionPublish &&
        (option.textRu ?? "").trim().length <= ITEM_LIMITS.optionPublish
    ),
    uniqueOptions:
      allDistinct(item.options.map((option) => normalizeOptionText(option.text))) &&
      allDistinct(item.options.map((option) => normalizeOptionText(option.textRu ?? ""))),
  };
  return ITEM_PUBLISH_RULES.map((rule) => ({ rule, ok: results[rule] }));
}

/** The rules an item fails; empty means it may be published. */
export function itemPublishIssues(item: ItemPublishInput): ItemPublishRule[] {
  return itemPublishChecks(item)
    .filter((check) => !check.ok)
    .map((check) => check.rule);
}

/** The editor's form, and what the save action parses: every field a string
 * or a number, "" for an empty optional text. A published status runs the
 * publish rules too, each reported on `status` under its own key. */
export const itemWriteSchema = z
  .object({
    id: itemIdSchema,
    day: assessmentDaySchema,
    topic: z.string().trim().min(1, "required").regex(TOPIC_PATTERN, "slug"),
    kind: z.enum(ITEM_KINDS),
    difficulty: itemDifficultySchema,
    status: z.enum(ITEM_STATUSES),
    prompt: z.string().trim().min(1, "required").max(ITEM_LIMITS.promptDraft, "tooLong"),
    promptRu: z.string().trim().max(ITEM_LIMITS.promptDraft, "tooLong"),
    explanation: z.string().trim().max(ITEM_LIMITS.explanation, "tooLong"),
    explanationRu: z.string().trim().max(ITEM_LIMITS.explanation, "tooLong"),
    sourceRef: z
      .string()
      .trim()
      .refine((value) => value === "" || SOURCE_REF_PATTERN.test(value), { message: "sourceRef" }),
    options: z
      .array(itemOptionInputSchema)
      .min(ITEM_LIMITS.minOptions, "optionsCount")
      .max(ITEM_LIMITS.maxOptions, "optionsCount"),
    /** The version the editor loaded; absent while creating. */
    version: versionSchema.optional(),
  })
  .superRefine((item, ctx) => {
    const seen = new Set<string>();
    item.options.forEach((option, index) => {
      if (seen.has(option.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "duplicateOptionId", path: ["options", index, "id"] });
      }
      seen.add(option.id);
    });

    if (item.status !== "published") return;
    for (const rule of itemPublishIssues(itemFormToPublishInput(item))) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: PUBLISH_RULE_KEYS[rule], path: ["status"] });
    }
  });

export type ItemWriteInput = z.input<typeof itemWriteSchema>;
export type ItemWrite = z.output<typeof itemWriteSchema>;

/** The form's shape as a publish-check input: "" is "not given". */
export function itemFormToPublishInput(item: {
  kind: ItemKind;
  prompt: string;
  promptRu: string;
  explanation: string;
  explanationRu: string;
  options: readonly { id: string; text: string; textRu: string; correct: boolean }[];
}): ItemPublishInput {
  return {
    kind: item.kind,
    prompt: item.prompt,
    promptRu: item.promptRu === "" ? null : item.promptRu,
    options: item.options.map((option) => ({
      id: option.id,
      text: option.text,
      textRu: option.textRu === "" ? null : option.textRu,
    })),
    answerKey: item.options.filter((option) => option.correct).map((option) => option.id),
    explanation: item.explanation === "" ? null : item.explanation,
    explanationRu: item.explanationRu === "" ? null : item.explanationRu,
  };
}

/** A row of public.assessment_items as the admin's session writes it (the
 * columns 0023 grants; version and the stamps are the triggers'). */
export interface ItemRowWrite {
  id: string;
  day: AssessmentDay;
  topic: string;
  kind: ItemKind;
  difficulty: ItemDifficulty;
  status: ItemWrite["status"];
  prompt: string;
  prompt_ru: string | null;
  options: Json;
  answer_key: string[];
  explanation: string | null;
  explanation_ru: string | null;
  source_ref: string | null;
}

const orNull = (value: string): string | null => (value === "" ? null : value);

export function itemWriteToRow(item: ItemWrite): ItemRowWrite {
  return {
    id: item.id,
    day: item.day,
    topic: item.topic,
    kind: item.kind,
    difficulty: item.difficulty,
    status: item.status,
    prompt: item.prompt,
    prompt_ru: orNull(item.promptRu),
    options: item.options.map((option) => ({ id: option.id, text: option.text, text_ru: orNull(option.textRu) })),
    answer_key: item.options.filter((option) => option.correct).map((option) => option.id),
    explanation: orNull(item.explanation),
    explanation_ru: orNull(item.explanationRu),
    source_ref: orNull(item.sourceRef),
  };
}

/** A stored row, parsed (lib/attestation/repository.ts). The shape rules are
 * the database's; this only narrows the types. */
export const itemRowSchema = z.object({
  id: z.string(),
  day: assessmentDaySchema,
  topic: z.string(),
  kind: z.enum(ITEM_KINDS),
  difficulty: itemDifficultySchema,
  prompt: z.string(),
  prompt_ru: z.string().nullable(),
  options: z.array(z.object({ id: z.string(), text: z.string(), text_ru: z.string().nullable().optional() })),
  answer_key: z.array(z.string()),
  explanation: z.string().nullable(),
  explanation_ru: z.string().nullable(),
  source_ref: z.string().nullable(),
  status: z.enum(ITEM_STATUSES),
  version: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
});

export const itemStatusChangeSchema = z.object({
  id: itemIdSchema,
  status: z.enum(ITEM_STATUSES),
  version: versionSchema,
});

export const itemDeleteSchema = z.object({ id: itemIdSchema, version: versionSchema });

// === Configuration ===================================================================

export const dayWeightsSchema = z
  .object({ partA: intInRange(0, 100), partB: intInRange(0, 100) })
  .strict()
  .refine((weights) => weights.partA + weights.partB === 100, { message: "weightsSum", path: ["partB"] });

export const thresholdsSchema = z
  .object({ green: intInRange(2, 100), yellow: intInRange(1, 99) })
  .strict()
  .refine((thresholds) => thresholds.yellow < thresholds.green, { message: "thresholdsOrder", path: ["yellow"] });

export const daySettingsSchema = z
  .object({
    itemCount: intInRange(DAY_SETTING_RANGES.itemCount.min, DAY_SETTING_RANGES.itemCount.max),
    itemSeconds: intInRange(DAY_SETTING_RANGES.itemSeconds.min, DAY_SETTING_RANGES.itemSeconds.max),
    minTurns: intInRange(DAY_SETTING_RANGES.minTurns.min, DAY_SETTING_RANGES.minTurns.max),
    maxTurns: intInRange(DAY_SETTING_RANGES.maxTurns.min, DAY_SETTING_RANGES.maxTurns.max),
    partBMinutes: intInRange(DAY_SETTING_RANGES.partBMinutes.min, DAY_SETTING_RANGES.partBMinutes.max),
  })
  .strict()
  .refine((settings) => settings.maxTurns >= settings.minTurns, { message: "turnsOrder", path: ["maxTurns"] });

export const weightsSchema = perDaySchema(dayWeightsSchema);
export const daySettingsPerDaySchema = perDaySchema(daySettingsSchema);

/** The settings form, and what its Server Action parses. */
export const assessmentConfigWriteSchema = z.object({
  weights: weightsSchema,
  thresholds: thresholdsSchema,
  daySettings: daySettingsPerDaySchema,
  extraFacts: z.string().max(EXTRA_FACTS_MAX_CHARS, "tooLong"),
  extraFactsRu: z.string().max(EXTRA_FACTS_MAX_CHARS, "tooLong"),
  retentionDays: intInRange(RETENTION_DAYS_RANGE.min, RETENTION_DAYS_RANGE.max),
  version: versionSchema,
});

export type AssessmentConfigWriteInput = z.input<typeof assessmentConfigWriteSchema>;
export type AssessmentConfigWrite = z.output<typeof assessmentConfigWriteSchema>;

/** The stored row (assessment_config), parsed into the domain shape by
 * lib/attestation/config.ts. */
export const assessmentConfigRowSchema = z.object({
  weights: weightsSchema,
  thresholds: thresholdsSchema,
  day_settings: daySettingsPerDaySchema,
  extra_facts: z.string(),
  extra_facts_ru: z.string(),
  retention_days: z.number().int(),
  version: z.number().int(),
  updated_at: z.string(),
  updated_by: z.string().nullable(),
});

// === Admin inputs (the admin_assessment_* functions) =================================

const noteSchema = z.string().trim().min(1, "required").max(OVERRIDE_NOTE_MAX_CHARS, "tooLong");

export const overrideInputSchema = z.object({
  attemptId: attemptIdSchema,
  score: z.number({ invalid_type_error: "number" }).finite("number").min(0, "outOfRange").max(100, "outOfRange"),
  note: noteSchema,
  version: versionSchema,
});

export const clearOverrideInputSchema = z.object({
  attemptId: attemptIdSchema,
  note: noteSchema,
  version: versionSchema,
});

export const resetAttemptInputSchema = z.object({ attemptId: attemptIdSchema, version: versionSchema });

export const resetPersonInputSchema = z.object({ email: userEmailSchema });

/** Day 1 is always open; an unlock is for 2–4. */
export const unlockDayInputSchema = z.object({
  email: userEmailSchema,
  day: z
    .number({ invalid_type_error: "invalid" })
    .refine((value): value is Exclude<AssessmentDay, 1> => value === 2 || value === 3 || value === 4, {
      message: "invalid",
    }),
});

// === The candidate API (S05) ==========================================================
// Every body is `.strict()`: an unknown key is a client bug or a probe, and
// the handler answers 400 either way. Nothing here carries an email, a score or
// a time — the server has all three.

export const startAttemptBodySchema = z.object({ day: assessmentDaySchema }).strict();

export const answerItemBodySchema = z
  .object({
    itemId: itemIdSchema,
    chosen: z
      .array(optionIdSchema)
      .min(1, "minItems")
      .max(ITEM_LIMITS.maxOptions, "tooLong")
      .refine((ids) => allDistinct(ids), { message: "invalid" }),
  })
  .strict();

export const beginPartBBodySchema = z.object({}).strict();

/** Longest a candidate may type one message, in ms (a stored signal only). */
export const TYPING_MS_MAX = 20 * 60 * 1000;

export const sendMessageBodySchema = z
  .object({
    content: z.string().trim().min(1, "required").max(OPERATOR_MESSAGE_MAX_CHARS, "tooLong"),
    typingMs: z.number().int().min(0).max(TYPING_MS_MAX),
    /** The candidate's own counter, so a retried POST is not stored twice. */
    clientSeq: z.number().int().min(1).max(200),
  })
  .strict();

/** Counters since the last report; the server adds them to `flags`. */
export const signalsBodySchema = z
  .object({
    tabHiddenCount: z.number().int().min(0).max(1000),
    tabHiddenMs: z.number().int().min(0).max(2 * 60 * 60 * 1000),
    blurCount: z.number().int().min(0).max(1000),
    pasteCount: z.number().int().min(0).max(1000),
    pastedChars: z.number().int().min(0).max(100_000),
  })
  .strict();

export const submitAttemptBodySchema = z.object({}).strict();

// === Stored JSON (assessment_attempts columns) ========================================

/** assessment_attempts.answers: per item id. */
export const answerRecordSchema = z.object({
  chosen: z.array(z.string()),
  served_at: z.string().nullable(),
  answered_at: z.string().nullable(),
});
export const answersSchema = z.record(z.string(), answerRecordSchema);

/** assessment_attempts.served_items: each drawn item as it was served. */
export const servedItemSchema = z.object({
  id: z.string(),
  version: z.number().int(),
  topic: z.string(),
  kind: z.enum(ITEM_KINDS),
  difficulty: itemDifficultySchema,
  prompt: z.string(),
  prompt_ru: z.string().nullable(),
  options: z.array(z.object({ id: z.string(), text: z.string(), text_ru: z.string().nullable() })),
  answer_key: z.array(z.string()),
  explanation: z.string().nullable(),
  explanation_ru: z.string().nullable(),
});
export const servedItemsSchema = z.array(servedItemSchema);

/** assessment_attempts.rubric: the evaluator's score per criterion. */
export const rubricResultSchema = z.array(
  z.object({
    criterion: z.string(),
    score: z.number().min(0).max(100),
    evidence: z.string().max(OPERATOR_MESSAGE_MAX_CHARS).optional(),
  })
);

export const FACTUAL_ERROR_SEVERITIES = ["minor", "major", "critical"] as const;

/** assessment_attempts.factual_errors: what the candidate said that the fact
 * sheet contradicts. */
export const factualErrorsSchema = z.array(
  z.object({
    quote: z.string().max(OPERATOR_MESSAGE_MAX_CHARS),
    correction: z.string().max(OPERATOR_MESSAGE_MAX_CHARS),
    severity: z.enum(FACTUAL_ERROR_SEVERITIES),
  })
);

/** assessment_attempts.evaluator_runs: one entry per evaluator call. */
export const evaluatorRunsSchema = z.array(
  z.object({
    at: z.string(),
    model: z.string(),
    ok: z.boolean(),
    error: z.string().optional(),
    latency_ms: z.number().int().min(0).optional(),
  })
);

/** assessment_attempts.flags: client signals (admin only, never a penalty by
 * themselves), caps S05 applied, and manipulation the evaluator found. */
export const attemptFlagsSchema = z
  .object({
    tab_hidden_count: z.number().int().min(0),
    tab_hidden_ms: z.number().int().min(0),
    blur_count: z.number().int().min(0),
    paste_count: z.number().int().min(0),
    pasted_chars: z.number().int().min(0),
    typing_ms: z.array(z.number().int().min(0)),
    caps: z.array(z.object({ scope: z.enum(["part_b", "day"]), max: z.number().min(0).max(100), reason: z.string() })),
    manipulation: z.array(z.object({ seq: z.number().int().min(1), kind: z.string() })),
  })
  .partial();

/** assessment_attempts.persona: the Part B customer (S05). */
export const personaSchema = z.object({
  archetype: z.string(),
  name: z.string(),
  city: z.string().optional(),
  business: z.string().optional(),
  goal: z.string(),
  objections: z.array(z.string()).default([]),
  competitorClaim: z.object({ competitorId: z.string(), claim: z.string() }).optional(),
  opening: z.string(),
});

/** Row of assessment_attempts the admin reads (lib/attestation/repository.ts). */
export const attemptRowSchema = z.object({
  id: z.string(),
  user_email: z.string(),
  day: assessmentDaySchema,
  attempt_no: z.number().int(),
  status: z.enum(ATTEMPT_STATUSES),
  phase: z.enum(ATTEMPT_PHASES),
  started_at: z.string(),
  submitted_at: z.string().nullable(),
  part_a_score: z.number().nullable(),
  part_b_score: z.number().nullable(),
  day_score: z.number().nullable(),
  override_score: z.number().nullable(),
  needs_review: z.boolean(),
  version: z.number().int(),
});
