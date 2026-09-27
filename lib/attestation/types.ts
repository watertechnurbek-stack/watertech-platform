// The attestation's vocabulary (docs/ATTESTATION.md). Client-safe: values and
// shapes only — no score, no rubric, no answer key lives here, so a candidate
// component (S06) may import it. What must never reach a browser is in the
// `server-only` modules next to it (rubrics, scoring, config, repository,
// items-draw, operator-view).

// === Days ========================================================================

export const ASSESSMENT_DAYS = [1, 2, 3, 4] as const;
export type AssessmentDay = (typeof ASSESSMENT_DAYS)[number];

export function isAssessmentDay(value: unknown): value is AssessmentDay {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

/** A value per day, keyed like the JSON columns of assessment_config ("1"–"4"). */
export type PerDay<T> = Readonly<Record<AssessmentDay, T>>;

// === Attempts ====================================================================

export const ATTEMPT_STATUSES = [
  "in_progress",
  "submitted",
  "evaluating",
  "evaluated",
  "eval_failed",
  "archived",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

/** Every status an attempt can have after its submit, archived aside. The pace
 * rule treats them alike, and a candidate reads all of them as "submitted". */
export const SUBMITTED_STATUSES = ["submitted", "evaluating", "evaluated", "eval_failed"] as const satisfies readonly AttemptStatus[];
export type SubmittedStatus = (typeof SUBMITTED_STATUSES)[number];

/** An attempt that still counts for its day: anything but a reset one. */
export type OpenAttemptStatus = Exclude<AttemptStatus, "archived">;

export function isSubmittedStatus(status: AttemptStatus): status is SubmittedStatus {
  return (SUBMITTED_STATUSES as readonly AttemptStatus[]).includes(status);
}

export const ATTEMPT_PHASES = ["part_a", "part_b"] as const;
export type AttemptPhase = (typeof ATTEMPT_PHASES)[number];

// === Items =======================================================================

export const ITEM_KINDS = ["single", "multi"] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

/** Also the item's points in Part A. */
export const ITEM_DIFFICULTIES = [1, 2, 3] as const;
export type ItemDifficulty = (typeof ITEM_DIFFICULTIES)[number];

export function isItemDifficulty(value: unknown): value is ItemDifficulty {
  return value === 1 || value === 2 || value === 3;
}

export const ITEM_STATUSES = ["draft", "published"] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

/** What an item's `source_ref` may point at: `<kind>:<content id>`. Content ids
 * are unique per table, not across tables, hence the kind. */
export const SOURCE_REF_KINDS = [
  "script",
  "objection",
  "faq",
  "competitor",
  "package",
  "product",
  "sop",
  "onboarding",
] as const;
export type SourceRefKind = (typeof SOURCE_REF_KINDS)[number];

/** Part A topics the editor suggests per day (docs/ATTESTATION.md §2). A topic
 * is any slug; these keep the bank's topics consistent enough for the draw to
 * balance across them. */
export const ITEM_TOPIC_SUGGESTIONS: PerDay<readonly string[]> = {
  1: ["company", "product-lines", "value-proposition", "competitor"],
  2: ["sizes", "pressure", "materials", "installation", "comparison"],
  3: ["funnel", "lead-creation", "task-setting", "loss-reasons", "sops", "ideal-client"],
  4: ["objections", "competitor-claim", "discovery", "closing", "terms"],
};

export interface ItemOption {
  /** Stable within the item (`a`, `b`, …): the answer key names options by id. */
  id: string;
  text: string;
  textRu: string | null;
}

export interface AssessmentItem {
  id: string;
  day: AssessmentDay;
  topic: string;
  kind: ItemKind;
  difficulty: ItemDifficulty;
  prompt: string;
  promptRu: string | null;
  options: ItemOption[];
  /** Option ids — server-only: never on a candidate path. */
  answerKey: string[];
  explanation: string | null;
  explanationRu: string | null;
  sourceRef: string | null;
  status: ItemStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  updatedBy: string | null;
}

// === Configuration ===============================================================

/** Part A and Part B weights of a day's score, integers summing to 100. */
export interface DayWeights {
  partA: number;
  partB: number;
}

/** A score ≥ green is green, ≥ yellow yellow, anything lower red. */
export interface BandThresholds {
  green: number;
  yellow: number;
}

export interface DaySettings {
  /** Part A items drawn for the day. */
  itemCount: number;
  /** Seconds per Part A item (the server adds a small grace). */
  itemSeconds: number;
  /** Operator turns the Part B conversation must reach before the candidate may end it… */
  minTurns: number;
  /** …and the turn at which the customer closes it. */
  maxTurns: number;
  /** The whole Part B session. */
  partBMinutes: number;
}

export interface AssessmentConfig {
  weights: PerDay<DayWeights>;
  thresholds: BandThresholds;
  daySettings: PerDay<DaySettings>;
  /** Factory facts for the AI (capacity, warranty terms, delivery, addresses). */
  extraFacts: string;
  extraFactsRu: string;
  retentionDays: number;
  /** 0 when these are the built-in defaults, not a stored row. */
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

// === Scores (admin only) =========================================================

export const BANDS = ["green", "yellow", "red"] as const;
export type Band = (typeof BANDS)[number];

/** The mean of four effective day scores, or how many of the four are in. */
export type FinalScore =
  | { kind: "complete"; percent: number }
  | { kind: "partial"; evaluated: number; total: 4 };

// === Pace ========================================================================

/** What `scheduleDays` answers for one day (lib/attestation/schedule.ts). The
 * admin sees it as it is; a candidate only through operator-view.ts. */
export type DaySchedule =
  | { day: AssessmentDay; kind: "open" }
  /** The previous day has not been submitted yet. */
  | { day: AssessmentDay; kind: "locked_after"; afterDay: AssessmentDay }
  /** The previous day was submitted; this one opens on a Tashkent date. */
  | { day: AssessmentDay; kind: "locked_until"; opensOn: string }
  /** An attempt that still counts for the day, with its real status. */
  | { day: AssessmentDay; kind: "attempt"; status: OpenAttemptStatus };

// === What a candidate may learn (hard rule, docs/ATTESTATION.md §7) ==============

export const OPERATOR_DAY_STATUSES = ["locked", "available", "in_progress", "submitted"] as const;
export type OperatorDayStatus = (typeof OPERATOR_DAY_STATUSES)[number];

export type OperatorDayState =
  | { day: AssessmentDay; status: "locked"; opensOn: string }
  | { day: AssessmentDay; status: "locked"; afterDay: AssessmentDay }
  | { day: AssessmentDay; status: "available" | "in_progress" | "submitted" };

export interface OperatorAttestationState {
  days: OperatorDayState[];
}
