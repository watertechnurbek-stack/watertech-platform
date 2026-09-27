import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ZodType, ZodTypeDef } from "zod";
import { adminErrorMap } from "@/lib/admin/validation";
import {
  DAY_SETTING_RANGES,
  EXTRA_FACTS_MAX_CHARS,
  ITEM_ID_PATTERN,
  ITEM_LIMITS,
  ITEM_PUBLISH_RULES,
  OPERATOR_MESSAGE_MAX_CHARS,
  OPTION_ID_PATTERN,
  OVERRIDE_NOTE_MAX_CHARS,
  RETENTION_DAYS_RANGE,
  SOURCE_REF_PATTERN,
  TOPIC_PATTERN,
  answerItemBodySchema,
  assessmentConfigWriteSchema,
  attemptFlagsSchema,
  itemPublishChecks,
  itemPublishIssues,
  itemWriteSchema,
  itemWriteToRow,
  normalizeOptionText,
  overrideInputSchema,
  resetPersonInputSchema,
  sendMessageBodySchema,
  signalsBodySchema,
  startAttemptBodySchema,
  unlockDayInputSchema,
  type ItemPublishInput,
  type ItemWriteInput,
} from "@/lib/attestation/schemas";
import { SOURCE_REF_KINDS } from "@/lib/attestation/types";

const MIGRATION = readFileSync(
  path.resolve(__dirname, "../../../supabase/migrations/0023_attestation.sql"),
  "utf8"
);

/** The admin.validation keys a failed parse reports (with the admin error map,
 * as the forms and actions parse), keyed by issue path. */
function issues<T>(schema: ZodType<T, ZodTypeDef, unknown>, input: unknown): Record<string, string[]> {
  const result = schema.safeParse(input, { errorMap: adminErrorMap });
  if (result.success) return {};
  const out: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

function item(overrides: Partial<ItemWriteInput> = {}): ItemWriteInput {
  return {
    id: "d1-warranty",
    day: 1,
    topic: "value-proposition",
    kind: "single",
    difficulty: 1,
    status: "draft",
    prompt: "  Kafolat muddati qancha?  ",
    promptRu: "",
    explanation: "",
    explanationRu: "",
    sourceRef: "",
    options: [
      { id: "a", text: "1 yil", textRu: "", correct: false },
      { id: "b", text: "10 yil", textRu: "", correct: true },
    ],
    ...overrides,
  };
}

function publishable(overrides: Partial<ItemWriteInput> = {}): ItemWriteInput {
  return item({
    status: "published",
    promptRu: "Какой срок гарантии?",
    explanation: "FAQ: 10 yil.",
    explanationRu: "FAQ: 10 лет.",
    sourceRef: "faq:product-1",
    options: [
      { id: "a", text: "1 yil", textRu: "1 год", correct: false },
      { id: "b", text: "10 yil", textRu: "10 лет", correct: true },
    ],
    ...overrides,
  });
}

describe("itemWriteSchema — a draft", () => {
  it("accepts a draft without Russian text, trims it, and maps it to the row the database stores", () => {
    const parsed = itemWriteSchema.parse(item(), { errorMap: adminErrorMap });
    expect(parsed.prompt).toBe("Kafolat muddati qancha?");
    expect(itemWriteToRow(parsed)).toEqual({
      id: "d1-warranty",
      day: 1,
      topic: "value-proposition",
      kind: "single",
      difficulty: 1,
      status: "draft",
      prompt: "Kafolat muddati qancha?",
      prompt_ru: null,
      options: [
        { id: "a", text: "1 yil", text_ru: null },
        { id: "b", text: "10 yil", text_ru: null },
      ],
      answer_key: ["b"],
      explanation: null,
      explanation_ru: null,
      source_ref: null,
    });
  });

  it.each([
    ["id", item({ id: "D1 Warranty" }), "slug"],
    ["id", item({ id: "x".repeat(81) }), "slug"],
    ["topic", item({ topic: "Company" }), "slug"],
    ["day", item({ day: 5 }), "invalid"],
    ["difficulty", item({ difficulty: 4 }), "invalid"],
    ["prompt", item({ prompt: "   " }), "required"],
    ["prompt", item({ prompt: "x".repeat(ITEM_LIMITS.promptDraft + 1) }), "tooLong"],
    ["sourceRef", item({ sourceRef: "faq" }), "sourceRef"],
    ["sourceRef", item({ sourceRef: "page:home" }), "sourceRef"],
    ["options", item({ options: [{ id: "a", text: "Bir", textRu: "", correct: true }] }), "optionsCount"],
    [
      "options",
      item({
        options: ["a", "b", "c", "d", "e", "f", "g"].map((id) => ({ id, text: id, textRu: "", correct: id === "a" })),
      }),
      "optionsCount",
    ],
    [
      "options.1.id",
      item({
        options: [
          { id: "a", text: "Bir", textRu: "", correct: true },
          { id: "a", text: "Ikki", textRu: "", correct: false },
        ],
      }),
      "duplicateOptionId",
    ],
    [
      "options.0.id",
      item({
        options: [
          { id: "A", text: "Bir", textRu: "", correct: true },
          { id: "b", text: "Ikki", textRu: "", correct: false },
        ],
      }),
      "invalid",
    ],
  ])("refuses %s → %s", (field, input, key) => {
    expect(issues(itemWriteSchema, input)[field]).toContain(key);
  });

  it("accepts a typed source reference", () => {
    expect(issues(itemWriteSchema, item({ sourceRef: "objection:obj-qimmat" }))).toEqual({});
  });

  it("does not run the publish rules on a draft", () => {
    expect(issues(itemWriteSchema, item({ promptRu: "", options: item().options }))).toEqual({});
  });
});

describe("itemWriteSchema — publishing", () => {
  it("accepts a complete item", () => {
    expect(issues(itemWriteSchema, publishable())).toEqual({});
  });

  it.each([
    ["no Russian prompt", publishable({ promptRu: "" }), "publishBothLocales"],
    [
      "an option without Russian",
      publishable({
        options: [
          { id: "a", text: "1 yil", textRu: "", correct: false },
          { id: "b", text: "10 yil", textRu: "10 лет", correct: true },
        ],
      }),
      "publishBothLocales",
    ],
    ["an explanation in one language", publishable({ explanationRu: "" }), "publishBothLocales"],
    [
      "two correct options on a single-choice item",
      publishable({
        options: [
          { id: "a", text: "1 yil", textRu: "1 год", correct: true },
          { id: "b", text: "10 yil", textRu: "10 лет", correct: true },
        ],
      }),
      "publishKeyCount",
    ],
    [
      "no correct option",
      publishable({
        kind: "multi",
        options: [
          { id: "a", text: "1 yil", textRu: "1 год", correct: false },
          { id: "b", text: "10 yil", textRu: "10 лет", correct: false },
        ],
      }),
      "publishKeyCount",
    ],
    ["a 401-character prompt", publishable({ prompt: "x".repeat(ITEM_LIMITS.promptPublish + 1) }), "publishPromptLength"],
    [
      "a 161-character option",
      publishable({
        options: [
          { id: "a", text: "x".repeat(ITEM_LIMITS.optionPublish + 1), textRu: "1 год", correct: false },
          { id: "b", text: "10 yil", textRu: "10 лет", correct: true },
        ],
      }),
      "publishOptionLength",
    ],
    [
      "two options that differ only in case and spacing",
      publishable({
        options: [
          { id: "a", text: "PPR  quvur", textRu: "ППР", correct: false },
          { id: "b", text: " ppr quvur ", textRu: "Канализация", correct: true },
        ],
      }),
      "publishUniqueOptions",
    ],
  ])("refuses %s, on `status`", (_label, input, key) => {
    expect(issues(itemWriteSchema, input).status).toContain(key);
  });

  it("allows several correct options on a multi-choice item", () => {
    expect(
      issues(
        itemWriteSchema,
        publishable({
          kind: "multi",
          options: [
            { id: "a", text: "PPR", textRu: "ППР", correct: true },
            { id: "b", text: "Kanalizatsiya", textRu: "Канализация", correct: true },
            { id: "c", text: "Po'lat", textRu: "Сталь", correct: false },
          ],
        })
      )
    ).toEqual({});
  });
});

describe("itemPublishChecks", () => {
  const stored: ItemPublishInput = {
    kind: "single",
    prompt: "Savol?",
    promptRu: "Вопрос?",
    options: [
      { id: "a", text: "Ha", textRu: "Да" },
      { id: "b", text: "Yo'q", textRu: "Нет" },
    ],
    answerKey: ["a"],
    explanation: null,
    explanationRu: null,
  };

  it("answers every rule, in order", () => {
    expect(itemPublishChecks(stored).map((check) => check.rule)).toEqual([...ITEM_PUBLISH_RULES]);
    expect(itemPublishIssues(stored)).toEqual([]);
  });

  it("catches a key that names no option, or names one twice", () => {
    expect(itemPublishIssues({ ...stored, answerKey: ["z"] })).toContain("keyInOptions");
    expect(itemPublishIssues({ ...stored, kind: "multi", answerKey: ["a", "a"] })).toContain("keyInOptions");
  });

  it("counts options on the stored row too", () => {
    expect(itemPublishIssues({ ...stored, options: [{ id: "a", text: "Ha", textRu: "Да" }] })).toContain("optionsCount");
  });

  it("normalises option text for the duplicate check", () => {
    expect(normalizeOptionText("  Ikki \t so'z ")).toBe("ikki so'z");
    expect(normalizeOptionText("ППР")).toBe("ппр");
  });
});

describe("assessmentConfigWriteSchema", () => {
  const perDay = <T,>(value: T) => ({ 1: value, 2: value, 3: value, 4: value });
  const config = {
    weights: { ...perDay({ partA: 40, partB: 60 }), 4: { partA: 20, partB: 80 } },
    thresholds: { green: 80, yellow: 60 },
    daySettings: perDay({ itemCount: 12, itemSeconds: 60, minTurns: 6, maxTurns: 8, partBMinutes: 20 }),
    extraFacts: "Zavod: sutkasiga 40 tonna.",
    extraFactsRu: "",
    retentionDays: 365,
    version: 3,
  };

  it("accepts the defaults", () => {
    expect(issues(assessmentConfigWriteSchema, config)).toEqual({});
  });

  it.each([
    ["weights.2.partB", { ...config, weights: { ...config.weights, 2: { partA: 50, partB: 60 } } }, "weightsSum"],
    ["thresholds.yellow", { ...config, thresholds: { green: 60, yellow: 60 } }, "thresholdsOrder"],
    [
      "daySettings.3.maxTurns",
      { ...config, daySettings: { ...config.daySettings, 3: { itemCount: 10, itemSeconds: 60, minTurns: 8, maxTurns: 7, partBMinutes: 20 } } },
      "turnsOrder",
    ],
    [
      "daySettings.1.itemSeconds",
      { ...config, daySettings: { ...config.daySettings, 1: { itemCount: 12, itemSeconds: 10, minTurns: 6, maxTurns: 8, partBMinutes: 20 } } },
      "outOfRange",
    ],
    [
      "daySettings.1.itemCount",
      { ...config, daySettings: { ...config.daySettings, 1: { itemCount: 2.5, itemSeconds: 60, minTurns: 6, maxTurns: 8, partBMinutes: 20 } } },
      "number",
    ],
    [
      "daySettings.2.itemCount",
      { ...config, daySettings: { ...config.daySettings, 2: { itemCount: Number.NaN, itemSeconds: 60, minTurns: 8, maxTurns: 10, partBMinutes: 20 } } },
      "number",
    ],
    ["extraFacts", { ...config, extraFacts: "x".repeat(EXTRA_FACTS_MAX_CHARS + 1) }, "tooLong"],
    ["retentionDays", { ...config, retentionDays: RETENTION_DAYS_RANGE.min - 1 }, "outOfRange"],
    ["version", { ...config, version: 0 }, "invalid"],
  ])("refuses %s → %s", (field, input, key) => {
    expect(issues(assessmentConfigWriteSchema, input)[field]).toContain(key);
  });

  it("refuses a fifth day and an unknown setting", () => {
    expect(assessmentConfigWriteSchema.safeParse({ ...config, weights: { ...config.weights, 5: { partA: 50, partB: 50 } } }).success).toBe(false);
    expect(
      assessmentConfigWriteSchema.safeParse({
        ...config,
        daySettings: { ...config.daySettings, 1: { ...config.daySettings[1], objectionCount: 2 } },
      }).success
    ).toBe(false);
  });
});

describe("admin inputs", () => {
  const attemptId = "a0000000-0000-4000-8000-000000000001";

  it("checks an override's score, note and attempt id", () => {
    expect(issues(overrideInputSchema, { attemptId, score: 72.5, note: " Tekshirildi ", version: 2 })).toEqual({});
    expect(issues(overrideInputSchema, { attemptId, score: 100.01, note: "x", version: 2 }).score).toContain("outOfRange");
    expect(issues(overrideInputSchema, { attemptId, score: 50, note: "   ", version: 2 }).note).toContain("required");
    expect(issues(overrideInputSchema, { attemptId, score: 50, note: "x".repeat(OVERRIDE_NOTE_MAX_CHARS + 1), version: 2 }).note).toContain("tooLong");
    expect(issues(overrideInputSchema, { attemptId: "not-a-uuid", score: 50, note: "x", version: 2 }).attemptId).toContain("invalid");
  });

  it("normalises an email and opens only days 2–4", () => {
    expect(resetPersonInputSchema.parse({ email: " Ali@WaterTech.UZ " }).email).toBe("ali@watertech.uz");
    expect(unlockDayInputSchema.safeParse({ email: "ali@watertech.uz", day: 3 }).success).toBe(true);
    expect(issues(unlockDayInputSchema, { email: "ali@watertech.uz", day: 1 }).day).toContain("invalid");
    expect(issues(unlockDayInputSchema, { email: "ali@watertech.uz", day: 5 }).day).toContain("invalid");
  });
});

describe("candidate API bodies (S05)", () => {
  it("are strict: an unknown key is refused", () => {
    expect(startAttemptBodySchema.safeParse({ day: 1 }).success).toBe(true);
    expect(startAttemptBodySchema.safeParse({ day: 1, email: "someone@else.uz" }).success).toBe(false);
    expect(startAttemptBodySchema.safeParse({ day: 0 }).success).toBe(false);
    expect(sendMessageBodySchema.safeParse({ content: "Salom", typingMs: 10, clientSeq: 1, score: 100 }).success).toBe(false);
  });

  it("caps an operator message at 600 characters, after trimming", () => {
    expect(sendMessageBodySchema.parse({ content: `  ${"x".repeat(OPERATOR_MESSAGE_MAX_CHARS)}  `, typingMs: 0, clientSeq: 1 }).content).toHaveLength(600);
    expect(issues(sendMessageBodySchema, { content: "x".repeat(OPERATOR_MESSAGE_MAX_CHARS + 1), typingMs: 0, clientSeq: 1 }).content).toContain("tooLong");
    expect(issues(sendMessageBodySchema, { content: "   ", typingMs: 0, clientSeq: 1 }).content).toContain("required");
  });

  it("takes an answer as distinct option ids", () => {
    expect(answerItemBodySchema.safeParse({ itemId: "d1-warranty", chosen: ["a", "c"] }).success).toBe(true);
    expect(answerItemBodySchema.safeParse({ itemId: "d1-warranty", chosen: [] }).success).toBe(false);
    expect(answerItemBodySchema.safeParse({ itemId: "d1-warranty", chosen: ["a", "a"] }).success).toBe(false);
    expect(answerItemBodySchema.safeParse({ itemId: "d1-warranty", chosen: ["<script>"] }).success).toBe(false);
  });

  it("bounds the client signals", () => {
    const signals = { tabHiddenCount: 1, tabHiddenMs: 5000, blurCount: 2, pasteCount: 0, pastedChars: 0 };
    expect(signalsBodySchema.safeParse(signals).success).toBe(true);
    expect(signalsBodySchema.safeParse({ ...signals, pasteCount: -1 }).success).toBe(false);
    expect(signalsBodySchema.safeParse({ ...signals, pastedChars: 100_001 }).success).toBe(false);
  });

  it("stores flags partially — any subset of the known signals", () => {
    expect(attemptFlagsSchema.safeParse({ paste_count: 2 }).success).toBe(true);
    expect(attemptFlagsSchema.safeParse({ paste_count: -2 }).success).toBe(false);
  });
});

describe("the limits mirror 0023_attestation.sql", () => {
  const has = (fragment: string): void => {
    expect(MIGRATION, fragment).toContain(fragment);
  };

  it("message, facts and note lengths", () => {
    has(`role <> 'operator' or char_length(content) <= ${OPERATOR_MESSAGE_MAX_CHARS}`);
    has(`check (char_length(extra_facts) <= ${EXTRA_FACTS_MAX_CHARS})`);
    has(`check (char_length(extra_facts_ru) <= ${EXTRA_FACTS_MAX_CHARS})`);
    has(`char_length(override_note) <= ${OVERRIDE_NOTE_MAX_CHARS}`);
    has(`retention_days between ${RETENTION_DAYS_RANGE.min} and ${RETENTION_DAYS_RANGE.max}`);
  });

  it("item limits and the publish rule numbers", () => {
    has(`char_length(prompt) between 1 and ${ITEM_LIMITS.promptDraft}`);
    has(`char_length(o ->> 'text') > ${ITEM_LIMITS.optionDraft}`);
    has(`char_length(explanation) <= ${ITEM_LIMITS.explanation}`);
    has(`char_length(p_prompt) > ${ITEM_LIMITS.promptPublish}`);
    has(`char_length(e ->> 'text') > ${ITEM_LIMITS.optionPublish}`);
    has(`n < ${ITEM_LIMITS.minOptions} or n > ${ITEM_LIMITS.maxOptions}`);
    has(`jsonb_array_length(p) > ${ITEM_LIMITS.maxOptions}`);
  });

  it("the day-setting ranges", () => {
    for (const [name, range] of Object.entries(DAY_SETTING_RANGES)) {
      has(`private.assessment_json_int_between(s -> '${name}', ${range.min}, ${range.max})`);
    }
  });

  it("the id, topic, option and source patterns", () => {
    has(`id ~ '${ITEM_ID_PATTERN.source}'`);
    has(`topic ~ '${TOPIC_PATTERN.source}'`);
    has(`(o ->> 'id') !~ '${OPTION_ID_PATTERN.source}'`);
    has(`source_ref ~ '${SOURCE_REF_PATTERN.source}'`);
    expect(SOURCE_REF_PATTERN.source).toContain(SOURCE_REF_KINDS.join("|"));
  });
});
