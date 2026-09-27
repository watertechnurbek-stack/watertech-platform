import { describe, expect, it } from "vitest";
import {
  EMPTY_ITEM_BANK_STATE,
  bankTopics,
  blankItemFormValues,
  filterItemBank,
  isFiltered,
  itemEditorPath,
  itemToFormValues,
  parseItemBankState,
  parseItemParam,
  serializeItemBankState,
  toItemBankRow,
  type ItemBankRow,
} from "@/lib/attestation/item-bank";
import { NEW_ITEM_ID, itemWriteSchema } from "@/lib/attestation/schemas";
import type { AssessmentItem } from "@/lib/attestation/types";

function item(overrides: Partial<AssessmentItem>): AssessmentItem {
  return {
    id: "d1-x",
    day: 1,
    topic: "company",
    kind: "single",
    difficulty: 1,
    prompt: "Savol",
    promptRu: "Вопрос",
    options: [
      { id: "a", text: "Ha", textRu: "Да" },
      { id: "b", text: "Yo'q", textRu: "Нет" },
    ],
    answerKey: ["a"],
    explanation: "Sababi shu.",
    explanationRu: "Потому что.",
    sourceRef: null,
    status: "published",
    version: 1,
    createdAt: "2026-09-26T00:00:00+00:00",
    updatedAt: "2026-09-26T00:00:00+00:00",
    updatedBy: null,
    ...overrides,
  };
}

const ROWS: ItemBankRow[] = [
  toItemBankRow(item({ id: "d2-sizes", day: 2, topic: "sizes", prompt: "PPR quvur o'lchamlari?", promptRu: "Размеры ППР труб?" })),
  toItemBankRow(item({ id: "d1-warranty", day: 1, topic: "company", prompt: "Kafolat muddati qancha?", difficulty: 2 })),
  toItemBankRow(item({ id: "d1-lines", day: 1, topic: "product-lines", prompt: "Liniyalar", status: "draft", promptRu: null })),
];

describe("toItemBankRow", () => {
  it("carries the list's columns and the publish readiness — never the key or the explanation", () => {
    const row = ROWS[2];
    expect(row?.issues).toEqual(["bothLocales"]);
    expect(row?.optionCount).toBe(2);
    const serialised = JSON.stringify(ROWS);
    expect(serialised).not.toContain("answerKey");
    expect(serialised).not.toContain("Sababi shu");
    expect(serialised).not.toContain("Потому что");
  });
});

describe("parseItemBankState / serializeItemBankState", () => {
  it("round-trips a full state", () => {
    const state = parseItemBankState({ day: "2", topic: "sizes", status: "draft", difficulty: "3", q: "ppr" });
    expect(state).toEqual({ day: 2, topic: "sizes", status: "draft", difficulty: 3, query: "ppr" });
    expect(parseItemBankState(Object.fromEntries(new URLSearchParams(serializeItemBankState(state).slice(1))))).toEqual(state);
  });

  it("reads anything unknown as no filter, and caps the query", () => {
    expect(parseItemBankState({ day: "5", topic: "Bad Topic", status: "archived", difficulty: "0", q: ["x".repeat(300)] })).toEqual({
      ...EMPTY_ITEM_BANK_STATE,
      query: "x".repeat(100),
    });
    expect(serializeItemBankState(EMPTY_ITEM_BANK_STATE)).toBe("");
    expect(isFiltered(EMPTY_ITEM_BANK_STATE)).toBe(false);
    expect(isFiltered({ ...EMPTY_ITEM_BANK_STATE, query: " " })).toBe(false);
    expect(isFiltered({ ...EMPTY_ITEM_BANK_STATE, day: 1 })).toBe(true);
  });
});

describe("filterItemBank", () => {
  it("sorts by day, topic and id", () => {
    expect(filterItemBank(ROWS, EMPTY_ITEM_BANK_STATE).map((row) => row.id)).toEqual(["d1-warranty", "d1-lines", "d2-sizes"]);
  });

  it("applies every filter", () => {
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, day: 1, status: "draft" }).map((row) => row.id)).toEqual(["d1-lines"]);
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, difficulty: 2 }).map((row) => row.id)).toEqual(["d1-warranty"]);
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, topic: "sizes" }).map((row) => row.id)).toEqual(["d2-sizes"]);
  });

  it("searches both languages, the id and the topic — case, apostrophes and Cyrillic folded", () => {
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, query: "KAFOLAT" }).map((row) => row.id)).toEqual(["d1-warranty"]);
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, query: "размеры" }).map((row) => row.id)).toEqual(["d2-sizes"]);
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, query: "olchamlari" }).map((row) => row.id)).toEqual(["d2-sizes"]);
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, query: "d1 lines" }).map((row) => row.id)).toEqual(["d1-lines"]);
    expect(filterItemBank(ROWS, { ...EMPTY_ITEM_BANK_STATE, query: "nothing-like-this" })).toEqual([]);
  });
});

it("bankTopics lists each topic once, sorted", () => {
  expect(bankTopics(ROWS)).toEqual(["company", "product-lines", "sizes"]);
});

it("parseItemParam reads an id segment back, and refuses anything else", () => {
  expect(parseItemParam("d1-warranty")).toBe("d1-warranty");
  expect(parseItemParam(encodeURIComponent("d1-warranty"))).toBe("d1-warranty");
  expect(parseItemParam("D1%20Bad")).toBeNull();
  expect(parseItemParam("%E0%A4%A")).toBeNull();
  expect(parseItemParam(NEW_ITEM_ID)).toBeNull();
  expect(itemEditorPath("d1-warranty")).toBe("/admin/assessments/items/d1-warranty");
});

describe("editor values", () => {
  it("itemToFormValues turns the answer key into correct boxes and nulls into empty text", () => {
    const values = itemToFormValues(
      item({ kind: "multi", answerKey: ["b"], promptRu: null, explanation: null, explanationRu: null, sourceRef: "faq:product-1", version: 7 })
    );
    expect(values.options).toEqual([
      { id: "a", text: "Ha", textRu: "Да", correct: false },
      { id: "b", text: "Yo'q", textRu: "Нет", correct: true },
    ]);
    expect(values).toMatchObject({ promptRu: "", explanation: "", explanationRu: "", sourceRef: "faq:product-1", version: 7 });
    // What the editor loads is what the save action accepts back.
    expect(itemWriteSchema.safeParse({ ...values, status: "draft" }).success).toBe(true);
  });

  it("a stored published item round-trips through the save schema", () => {
    expect(itemWriteSchema.safeParse(itemToFormValues(item({}))).success).toBe(true);
  });

  it("blankItemFormValues is a draft with two empty options and no version", () => {
    const blank = blankItemFormValues();
    expect(blank).toMatchObject({ id: "", day: 1, kind: "single", difficulty: 1, status: "draft" });
    expect(blank.options.map((option) => option.id)).toEqual(["a", "b"]);
    expect(blank.version).toBeUndefined();
  });

  it("no item may take the create segment as its id", () => {
    const values = { ...itemToFormValues(item({})), id: NEW_ITEM_ID, version: undefined };
    const parsed = itemWriteSchema.safeParse(values);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(["id"]);
  });
});
