import { describe, expect, it } from "vitest";
import {
  OPERATOR_STATE_KEYS,
  buildOperatorAttestationState,
  toOperatorDayState,
} from "@/lib/attestation/operator-view";
import { ATTEMPT_PHASES, ATTEMPT_STATUSES, type AttemptPhase, type AttemptStatus } from "@/lib/attestation/types";

// The hard rule of docs/ATTESTATION.md §7: a candidate learns per-day status
// and nothing else. The inputs below are FULL attempt rows — scores, rubric,
// answer keys, evaluator text — passed the way a careless caller might pass
// them. Whatever arrives, the output must hold only the allow-listed keys and
// the allowed values.

const SCORE_VALUES = [87.25, 91.5, 89.8, 72.46, 64];
const SECRET_STRINGS = [
  "evaluated",
  "evaluating",
  "eval_failed",
  "archived",
  "green",
  "yellow",
  "red",
  "Yaxshi",
  "greeting",
  "answer",
  "Narxi qimmat — javob",
  "gemini",
];

/** A full row with everything a candidate must never learn. */
function fullRow(day: 1 | 2 | 3 | 4, status: AttemptStatus, phase: AttemptPhase, submittedAt: string | null) {
  return {
    id: `a0000000-0000-4000-8000-00000000000${day}`,
    day,
    status,
    phase,
    submittedAt,
    attemptNo: 1,
    partAScore: 87.25,
    partBScore: 91.5,
    dayScore: 89.8,
    overrideScore: 72.46,
    band: "green",
    rubric: [{ criterion: "greeting", score: 64, evidence: "Narxi qimmat — javob" }],
    answerKey: ["b"],
    answers: { "d1-warranty": { chosen: ["b"], correct: true } },
    evaluatorRuns: [{ model: "gemini", ok: status !== "eval_failed" }],
    needsReview: true,
  };
}

function walk(value: unknown, keys: Set<string>, leaves: unknown[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) walk(entry, keys, leaves);
  } else if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value)) {
      keys.add(key);
      walk(entry, keys, leaves);
    }
  } else {
    leaves.push(value);
  }
}

function assertOnlyStatus(serialised: string): void {
  const keys = new Set<string>();
  const leaves: unknown[] = [];
  walk(JSON.parse(serialised), keys, leaves);

  expect([...keys].filter((key) => !(OPERATOR_STATE_KEYS as readonly string[]).includes(key))).toEqual([]);
  for (const leaf of leaves) {
    if (typeof leaf === "number") {
      // Only a day number (day, afterDay).
      expect([1, 2, 3, 4]).toContain(leaf);
    } else if (typeof leaf === "string") {
      expect(
        ["locked", "available", "in_progress", "submitted"].includes(leaf) || /^\d{4}-\d{2}-\d{2}$/.test(leaf),
        leaf
      ).toBe(true);
    } else {
      throw new Error(`unexpected leaf ${String(leaf)}`);
    }
  }
  for (const value of SCORE_VALUES) expect(serialised).not.toContain(String(value));
  for (const secret of SECRET_STRINGS) expect(serialised).not.toContain(secret);
}

const STATES: [AttemptStatus, AttemptPhase][] = ATTEMPT_STATUSES.flatMap((status) =>
  ATTEMPT_PHASES.map((phase): [AttemptStatus, AttemptPhase] => [status, phase])
);

describe("buildOperatorAttestationState", () => {
  it.each(STATES)("serialises a %s / %s attempt to status only", (status, phase) => {
    const submitted = status === "in_progress" ? null : "2026-09-25T10:00:00.000Z";
    const state = buildOperatorAttestationState({
      attempts: [fullRow(1, status, phase, submitted), fullRow(2, status, phase, submitted)],
      unlockedDays: [3],
      today: "2026-09-26",
    });
    assertOnlyStatus(JSON.stringify(state));
    expect(state.days.map((day) => day.day)).toEqual([1, 2, 3, 4]);
  });

  it("reads every evaluation state as submitted, and in_progress as in_progress", () => {
    for (const status of ["submitted", "evaluating", "evaluated", "eval_failed"] as const) {
      const state = buildOperatorAttestationState({
        attempts: [fullRow(1, status, "part_b", "2026-09-25T10:00:00.000Z")],
        unlockedDays: [],
        today: "2026-09-26",
      });
      expect(state.days[0]).toEqual({ day: 1, status: "submitted" });
      expect(state.days[1]).toEqual({ day: 2, status: "available" });
    }
    const taking = buildOperatorAttestationState({
      attempts: [fullRow(1, "in_progress", "part_a", null)],
      unlockedDays: [],
      today: "2026-09-26",
    });
    expect(taking.days[0]).toEqual({ day: 1, status: "in_progress" });
    expect(taking.days[1]).toEqual({ day: 2, status: "locked", afterDay: 1 });
  });

  it("says when a waiting day opens, as a Tashkent date and nothing more", () => {
    const state = buildOperatorAttestationState({
      attempts: [fullRow(1, "evaluated", "part_b", "2026-09-26T05:00:00.000Z")],
      unlockedDays: [],
      today: "2026-09-26",
    });
    expect(state.days[1]).toEqual({ day: 2, status: "locked", opensOn: "2026-09-27" });
    assertOnlyStatus(JSON.stringify(state));
  });

  it("shows an archived day as available again, without saying it was reset", () => {
    const state = buildOperatorAttestationState({
      attempts: [fullRow(1, "archived", "part_b", "2026-09-20T05:00:00.000Z")],
      unlockedDays: [],
      today: "2026-09-26",
    });
    expect(state.days[0]).toEqual({ day: 1, status: "available" });
  });
});

describe("toOperatorDayState", () => {
  it("builds each shape key by key", () => {
    expect(Object.keys(toOperatorDayState({ day: 2, kind: "locked_after", afterDay: 1 }))).toEqual(["day", "status", "afterDay"]);
    expect(Object.keys(toOperatorDayState({ day: 2, kind: "locked_until", opensOn: "2026-09-27" }))).toEqual(["day", "status", "opensOn"]);
    expect(Object.keys(toOperatorDayState({ day: 1, kind: "attempt", status: "eval_failed" }))).toEqual(["day", "status"]);
    expect(Object.keys(toOperatorDayState({ day: 1, kind: "open" }))).toEqual(["day", "status"]);
  });
});
