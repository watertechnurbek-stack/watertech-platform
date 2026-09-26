import { normalizeSearchText } from "@/lib/search/normalize";
import { ITEM_ID_PATTERN, NEW_ITEM_ID, itemPublishIssues, type ItemPublishRule, type ItemWrite } from "./schemas";
import {
  ITEM_STATUSES,
  isAssessmentDay,
  isItemDifficulty,
  type AssessmentDay,
  type AssessmentItem,
  type ItemDifficulty,
  type ItemKind,
  type ItemStatus,
} from "./types";

// The item bank list at /admin/assessments/items (docs/ATTESTATION.md §17):
// what the server hands the client per item, and the filter / search state
// that lives in the URL (`?day=&topic=&status=&difficulty=&q=`) — read on the
// server for the first paint, written back with history.replaceState (CLAUDE.md
// §4). Pure and client-safe; the row carries no answer key and no explanation.

export interface ItemBankRow {
  id: string;
  day: AssessmentDay;
  topic: string;
  kind: ItemKind;
  difficulty: ItemDifficulty;
  status: ItemStatus;
  version: number;
  prompt: string;
  promptRu: string | null;
  optionCount: number;
  /** Publish rules the stored row fails — empty when it may be published. */
  issues: ItemPublishRule[];
  updatedAt: string;
  updatedBy: string | null;
}

export function toItemBankRow(item: AssessmentItem): ItemBankRow {
  return {
    id: item.id,
    day: item.day,
    topic: item.topic,
    kind: item.kind,
    difficulty: item.difficulty,
    status: item.status,
    version: item.version,
    prompt: item.prompt,
    promptRu: item.promptRu,
    optionCount: item.options.length,
    issues: itemPublishIssues(item),
    updatedAt: item.updatedAt,
    updatedBy: item.updatedBy,
  };
}

export interface ItemBankState {
  day: AssessmentDay | null;
  topic: string | null;
  status: ItemStatus | null;
  difficulty: ItemDifficulty | null;
  query: string;
}

export const EMPTY_ITEM_BANK_STATE: ItemBankState = { day: null, topic: null, status: null, difficulty: null, query: "" };

/** The longest search a URL may carry back. */
export const ITEM_BANK_QUERY_MAX_LENGTH = 100;

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function isItemStatus(value: string | undefined): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value ?? "");
}

/** Anything unknown or malformed reads as "no filter". */
export function parseItemBankState(params: SearchParams): ItemBankState {
  const day = Number(single(params.day));
  const difficulty = Number(single(params.difficulty));
  const topic = single(params.topic)?.trim() ?? "";
  const status = single(params.status);
  return {
    day: isAssessmentDay(day) ? day : null,
    topic: /^[a-z0-9-]{1,40}$/.test(topic) ? topic : null,
    status: isItemStatus(status) ? status : null,
    difficulty: isItemDifficulty(difficulty) ? difficulty : null,
    query: (single(params.q) ?? "").slice(0, ITEM_BANK_QUERY_MAX_LENGTH),
  };
}

/** `?day=…` for the URL, only the parts that are set; "" when none is. */
export function serializeItemBankState(state: ItemBankState): string {
  const params = new URLSearchParams();
  if (state.day !== null) params.set("day", String(state.day));
  if (state.topic !== null) params.set("topic", state.topic);
  if (state.status !== null) params.set("status", state.status);
  if (state.difficulty !== null) params.set("difficulty", String(state.difficulty));
  if (state.query.trim() !== "") params.set("q", state.query);
  const text = params.toString();
  return text === "" ? "" : `?${text}`;
}

export function isFiltered(state: ItemBankState): boolean {
  return (
    state.day !== null || state.topic !== null || state.status !== null || state.difficulty !== null || state.query.trim() !== ""
  );
}

/** Rows matching every set filter and every word of the search (case,
 * apostrophes and Cyrillic folded like the app's search), in day, topic, id
 * order. */
export function filterItemBank(rows: readonly ItemBankRow[], state: ItemBankState): ItemBankRow[] {
  const terms = normalizeSearchText(state.query).split(" ").filter((term) => term !== "");
  return rows
    .filter(
      (row) =>
        (state.day === null || row.day === state.day) &&
        (state.topic === null || row.topic === state.topic) &&
        (state.status === null || row.status === state.status) &&
        (state.difficulty === null || row.difficulty === state.difficulty)
    )
    .filter((row) => {
      if (terms.length === 0) return true;
      const haystack = normalizeSearchText([row.id, row.topic, row.prompt, row.promptRu ?? ""].join(" "));
      return terms.every((term) => haystack.includes(term));
    })
    .sort((a, b) => a.day - b.day || a.topic.localeCompare(b.topic) || a.id.localeCompare(b.id));
}

/** An item id from the editor's URL segment, or null for anything that is not
 * one (the page answers 404). NEW_ITEM_ID is the create form, not an id — the
 * page checks for it first. */
export function parseItemParam(raw: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return ITEM_ID_PATTERN.test(decoded) && decoded !== NEW_ITEM_ID ? decoded : null;
}

/** The editor of one item; NEW_ITEM_ID opens an empty one. */
export function itemEditorPath(id: string): string {
  return `/admin/assessments/items/${encodeURIComponent(id)}`;
}

/** The editor's values for a stored item: the answer key becomes each
 * option's "correct" box, a missing text becomes "". The version rides along
 * for the optimistic-concurrency check. */
export function itemToFormValues(item: AssessmentItem): ItemWrite {
  return {
    id: item.id,
    day: item.day,
    topic: item.topic,
    kind: item.kind,
    difficulty: item.difficulty,
    status: item.status,
    prompt: item.prompt,
    promptRu: item.promptRu ?? "",
    explanation: item.explanation ?? "",
    explanationRu: item.explanationRu ?? "",
    sourceRef: item.sourceRef ?? "",
    options: item.options.map((option) => ({
      id: option.id,
      text: option.text,
      textRu: option.textRu ?? "",
      correct: item.answerKey.includes(option.id),
    })),
    version: item.version,
  };
}

/** A new item: a single-choice draft for day 1 with two empty options. */
export function blankItemFormValues(): ItemWrite {
  return {
    id: "",
    day: 1,
    topic: "",
    kind: "single",
    difficulty: 1,
    status: "draft",
    prompt: "",
    promptRu: "",
    explanation: "",
    explanationRu: "",
    sourceRef: "",
    options: [
      { id: "a", text: "", textRu: "", correct: false },
      { id: "b", text: "", textRu: "", correct: false },
    ],
  };
}

/** Every topic in use, sorted — the topic filter's options. */
export function bankTopics(rows: readonly ItemBankRow[]): string[] {
  return [...new Set(rows.map((row) => row.topic))].sort();
}

