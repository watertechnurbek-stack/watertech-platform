import "server-only";
import type { Rubric } from "./rubrics";
import type { AssessmentDay, Band, BandThresholds, DayWeights, FinalScore, ItemDifficulty } from "./types";
import { ASSESSMENT_DAYS } from "./types";

// Every score of the attestation (docs/ATTESTATION.md §4). Pure, and
// `server-only`: a score is admin-only (hard rule, §7), so the arithmetic that
// makes one never ships in a client bundle either.
//
// Percentages are 0–100 and unrounded here; `roundScore` is what a write rounds
// with (the columns are numeric(5,2)), and display rounds further. Caps are
// inputs: S05 decides when a Part B or a day is capped and why (the reason goes
// into the attempt's flags), this module only applies the number.

// === Part A ======================================================================

export interface PartAItem {
  id: string;
  difficulty: ItemDifficulty;
  answerKey: readonly string[];
}

export interface PartAAnswer {
  chosen: readonly string[];
  /** When the server served the item; null if it never was. */
  servedAt: string | null;
  /** When the answer arrived; null if it never did. */
  answeredAt: string | null;
}

export interface PartAInput {
  items: readonly PartAItem[];
  answers: Readonly<Record<string, PartAAnswer | undefined>>;
  /** The day's per-item limit (day_settings[d].itemSeconds). */
  itemSeconds: number;
  /** The server's grace on top (PART_A_GRACE_SECONDS). */
  graceSeconds: number;
}

export type PartAOutcome = "correct" | "incorrect" | "late" | "unanswered";

export interface PartAItemResult {
  id: string;
  outcome: PartAOutcome;
  /** The item's difficulty when correct, else 0. */
  points: number;
  possible: number;
}

export interface PartAResult {
  earned: number;
  possible: number;
  /** earned / possible × 100; 0 for an attempt with no items. */
  percent: number;
  items: PartAItemResult[];
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const id of left) if (!right.has(id)) return false;
  return true;
}

function outcomeOf(item: PartAItem, answer: PartAAnswer | undefined, limitMs: number): PartAOutcome {
  if (!answer || answer.servedAt === null || answer.answeredAt === null || answer.chosen.length === 0) {
    return "unanswered";
  }
  const served = Date.parse(answer.servedAt);
  const answered = Date.parse(answer.answeredAt);
  if (!Number.isFinite(served) || !Number.isFinite(answered) || answered - served > limitMs) return "late";
  // Exact set equality: a multi-select item pays nothing for a partial or a
  // "select everything" answer.
  return sameSet(answer.chosen, item.answerKey) ? "correct" : "incorrect";
}

/** Part A: each item is worth its difficulty, earned only when the chosen set
 * equals the key and arrived within itemSeconds + graceSeconds of serving. */
export function scorePartA(input: PartAInput): PartAResult {
  if (!Number.isFinite(input.itemSeconds) || input.itemSeconds <= 0 || !Number.isFinite(input.graceSeconds) || input.graceSeconds < 0) {
    throw new RangeError("scorePartA: itemSeconds must be positive and graceSeconds non-negative");
  }
  const limitMs = (input.itemSeconds + input.graceSeconds) * 1000;

  const items = input.items.map((item): PartAItemResult => {
    const outcome = outcomeOf(item, input.answers[item.id], limitMs);
    return { id: item.id, outcome, points: outcome === "correct" ? item.difficulty : 0, possible: item.difficulty };
  });
  const earned = items.reduce((sum, item) => sum + item.points, 0);
  const possible = items.reduce((sum, item) => sum + item.possible, 0);
  return { earned, possible, percent: possible === 0 ? 0 : (earned / possible) * 100, items };
}

// === Part B ======================================================================

export interface CriterionScore {
  criterion: string;
  /** 0–100: how fully the criterion was met. */
  score: number;
}

export interface PartBInput {
  rubric: Rubric;
  scores: readonly CriterionScore[];
  /** The most Part B may score (0–100), when S05 caps it. */
  cap?: number;
}

export interface PartBResult {
  percent: number;
  /** Criteria the evaluator did not score — each counted as 0. */
  missing: string[];
  capped: boolean;
}

function assertPercent(value: number, what: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new RangeError(`${what} must be a number between 0 and 100`);
  }
}

/** Part B: Σ weight × score / 100 over the day's rubric. A criterion the rubric
 * does not have, a duplicate, or a score outside 0–100 is a programming error
 * (the evaluator's output is parsed with zod first) and throws. */
export function scorePartB(input: PartBInput): PartBResult {
  const known = new Set(input.rubric.criteria.map((criterion) => criterion.id));
  const byId = new Map<string, number>();
  for (const entry of input.scores) {
    if (!known.has(entry.criterion)) throw new RangeError(`scorePartB: unknown criterion "${entry.criterion}"`);
    if (byId.has(entry.criterion)) throw new RangeError(`scorePartB: criterion "${entry.criterion}" scored twice`);
    assertPercent(entry.score, `scorePartB: the score of "${entry.criterion}"`);
    byId.set(entry.criterion, entry.score);
  }
  if (input.cap !== undefined) assertPercent(input.cap, "scorePartB: cap");

  const missing: string[] = [];
  let percent = 0;
  for (const criterion of input.rubric.criteria) {
    const score = byId.get(criterion.id);
    if (score === undefined) missing.push(criterion.id);
    else percent += (criterion.weight * score) / 100;
  }
  const capped = input.cap !== undefined && percent > input.cap;
  return { percent: capped && input.cap !== undefined ? input.cap : percent, missing, capped };
}

// === Day, final, band =============================================================

export interface DayScoreInput {
  partA: number;
  /** null when Part B never happened — it counts 0. */
  partB: number | null;
  weights: DayWeights;
  /** The most the day may score (0–100), when S05 caps it. */
  cap?: number;
}

/** Day% = wA·A% + wB·B% with the day's weights (each pair sums to 100). */
export function scoreDay(input: DayScoreInput): number {
  assertPercent(input.partA, "scoreDay: partA");
  if (input.partB !== null) assertPercent(input.partB, "scoreDay: partB");
  if (input.weights.partA + input.weights.partB !== 100 || input.weights.partA < 0 || input.weights.partB < 0) {
    throw new RangeError("scoreDay: weights must be non-negative and sum to 100");
  }
  const day = (input.weights.partA * input.partA + input.weights.partB * (input.partB ?? 0)) / 100;
  if (input.cap === undefined) return day;
  assertPercent(input.cap, "scoreDay: cap");
  return Math.min(day, input.cap);
}

/** What counts for a day: the admin's override, else the computed score. */
export function effectiveDayScore(attempt: { dayScore: number | null; overrideScore: number | null }): number | null {
  return attempt.overrideScore ?? attempt.dayScore;
}

/** The mean of the four effective day scores once all four exist; until then,
 * how many do. Indexed by day: `days[1]` … `days[4]`. */
export function finalScore(days: Readonly<Partial<Record<AssessmentDay, number | null>>>): FinalScore {
  const present = ASSESSMENT_DAYS.map((day) => days[day]).filter((score): score is number => typeof score === "number");
  if (present.length < ASSESSMENT_DAYS.length) {
    return { kind: "partial", evaluated: present.length, total: 4 };
  }
  return { kind: "complete", percent: present.reduce((sum, score) => sum + score, 0) / present.length };
}

/** green ≥ thresholds.green, yellow ≥ thresholds.yellow, red below. */
export function bandFor(percent: number, thresholds: BandThresholds): Band {
  if (percent >= thresholds.green) return "green";
  if (percent >= thresholds.yellow) return "yellow";
  return "red";
}

/** Two decimals, half away from zero — what a numeric(5,2) column stores for
 * the same decimal. The epsilon absorbs binary noise (72.455 is
 * 72.45499999… as a double) without moving a genuinely lower value. */
export function roundScore(value: number): number {
  if (!Number.isFinite(value)) throw new RangeError("roundScore: not a finite number");
  const rounded = Math.round(Math.abs(value) * 100 + 1e-9) / 100;
  return value < 0 ? -rounded : rounded;
}
