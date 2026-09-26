import { describe, expect, it } from "vitest";
import { rubricFor } from "@/lib/attestation/rubrics";
import {
  bandFor,
  effectiveDayScore,
  finalScore,
  roundScore,
  scoreDay,
  scorePartA,
  scorePartB,
  type PartAAnswer,
  type PartAItem,
} from "@/lib/attestation/scoring";

const SERVED = "2026-09-26T05:00:00.000Z";
const at = (seconds: number): string => new Date(Date.parse(SERVED) + seconds * 1000).toISOString();
const answer = (chosen: string[], seconds: number): PartAAnswer => ({ chosen, servedAt: SERVED, answeredAt: at(seconds) });

const ITEMS: PartAItem[] = [
  { id: "easy", difficulty: 1, answerKey: ["b"] },
  { id: "medium", difficulty: 2, answerKey: ["a", "c"] },
  { id: "hard", difficulty: 3, answerKey: ["d"] },
];

describe("scorePartA", () => {
  it("weights items by difficulty: earned / possible × 100", () => {
    const result = scorePartA({
      items: ITEMS,
      answers: { easy: answer(["b"], 10), medium: answer(["c", "a"], 30), hard: answer(["a"], 5) },
      itemSeconds: 60,
      graceSeconds: 5,
    });
    expect(result).toMatchObject({ earned: 3, possible: 6, percent: 50 });
    expect(result.items.map((item) => [item.id, item.outcome, item.points])).toEqual([
      ["easy", "correct", 1],
      ["medium", "correct", 2],
      ["hard", "incorrect", 0],
    ]);
  });

  it("gives a multi-choice item nothing for a partial or an 'everything' answer", () => {
    const partial = scorePartA({ items: ITEMS, answers: { medium: answer(["a"], 1) }, itemSeconds: 60, graceSeconds: 5 });
    const everything = scorePartA({ items: ITEMS, answers: { medium: answer(["a", "b", "c", "d"], 1) }, itemSeconds: 60, graceSeconds: 5 });
    expect(partial.items[1]?.outcome).toBe("incorrect");
    expect(everything.items[1]?.outcome).toBe("incorrect");
  });

  it("counts an answer within the limit plus the grace, and nothing after it", () => {
    const onTime = scorePartA({ items: ITEMS, answers: { easy: answer(["b"], 65) }, itemSeconds: 60, graceSeconds: 5 });
    const late = scorePartA({ items: ITEMS, answers: { easy: answer(["b"], 65.001) }, itemSeconds: 60, graceSeconds: 5 });
    expect(onTime.items[0]?.outcome).toBe("correct");
    expect(late.items[0]).toMatchObject({ outcome: "late", points: 0, possible: 1 });
  });

  it("scores a missing, empty or never-served answer as unanswered", () => {
    const result = scorePartA({
      items: ITEMS,
      answers: {
        easy: { chosen: ["b"], servedAt: null, answeredAt: at(1) },
        medium: { chosen: [], servedAt: SERVED, answeredAt: at(1) },
      },
      itemSeconds: 60,
      graceSeconds: 5,
    });
    expect(result.items.map((item) => item.outcome)).toEqual(["unanswered", "unanswered", "unanswered"]);
    expect(result.percent).toBe(0);
  });

  it("is 0 for an attempt with no items, and refuses nonsense limits", () => {
    expect(scorePartA({ items: [], answers: {}, itemSeconds: 60, graceSeconds: 5 })).toMatchObject({ possible: 0, percent: 0 });
    expect(() => scorePartA({ items: ITEMS, answers: {}, itemSeconds: 0, graceSeconds: 5 })).toThrow(RangeError);
    expect(() => scorePartA({ items: ITEMS, answers: {}, itemSeconds: 60, graceSeconds: -1 })).toThrow(RangeError);
  });
});

describe("scorePartB", () => {
  const rubric = rubricFor(1);
  const full = rubric.criteria.map((criterion) => ({ criterion: criterion.id, score: 100 }));

  it("is Σ weight × score / 100 over the day's rubric", () => {
    expect(scorePartB({ rubric, scores: full })).toEqual({ percent: 100, missing: [], capped: false });
    // greeting 15 × 80% + companyFacts 25 × 40% = 12 + 10.
    const result = scorePartB({
      rubric,
      scores: [
        { criterion: "greeting", score: 80 },
        { criterion: "companyFacts", score: 40 },
      ],
    });
    expect(result.percent).toBeCloseTo(22, 10);
    expect(result.missing).toEqual(["productLines", "needsDiscovery", "nextStep", "courtesy"]);
  });

  it("applies a cap only when the score is above it", () => {
    expect(scorePartB({ rubric, scores: full, cap: 50 })).toMatchObject({ percent: 50, capped: true });
    expect(scorePartB({ rubric, scores: [{ criterion: "greeting", score: 100 }], cap: 50 })).toMatchObject({
      percent: 15,
      capped: false,
    });
  });

  it("refuses an unknown criterion, a duplicate, and a score outside 0–100", () => {
    expect(() => scorePartB({ rubric, scores: [{ criterion: "technicalAccuracy", score: 50 }] })).toThrow(/unknown criterion/);
    expect(() =>
      scorePartB({ rubric, scores: [{ criterion: "greeting", score: 50 }, { criterion: "greeting", score: 60 }] })
    ).toThrow(/twice/);
    expect(() => scorePartB({ rubric, scores: [{ criterion: "greeting", score: 101 }] })).toThrow(RangeError);
    expect(() => scorePartB({ rubric, scores: full, cap: -1 })).toThrow(RangeError);
  });
});

describe("scoreDay", () => {
  it("weights Part A and Part B by the day's weights", () => {
    expect(scoreDay({ partA: 50, partB: 100, weights: { partA: 40, partB: 60 } })).toBe(80);
    expect(scoreDay({ partA: 100, partB: 50, weights: { partA: 20, partB: 80 } })).toBe(60);
  });

  it("counts a Part B that never happened as 0, and applies a day cap", () => {
    expect(scoreDay({ partA: 90, partB: null, weights: { partA: 40, partB: 60 } })).toBe(36);
    expect(scoreDay({ partA: 100, partB: 100, weights: { partA: 40, partB: 60 }, cap: 30 })).toBe(30);
  });

  it("refuses weights that do not sum to 100 and scores outside 0–100", () => {
    expect(() => scoreDay({ partA: 50, partB: 50, weights: { partA: 50, partB: 60 } })).toThrow(RangeError);
    expect(() => scoreDay({ partA: 150, partB: 50, weights: { partA: 40, partB: 60 } })).toThrow(RangeError);
  });
});

describe("effective and final scores", () => {
  it("lets an override replace the computed day score", () => {
    expect(effectiveDayScore({ dayScore: 64.5, overrideScore: 80 })).toBe(80);
    expect(effectiveDayScore({ dayScore: 64.5, overrideScore: null })).toBe(64.5);
    expect(effectiveDayScore({ dayScore: null, overrideScore: null })).toBeNull();
  });

  it("is the mean of four days, or k / 4 until then", () => {
    expect(finalScore({ 1: 80, 2: 60, 3: 70, 4: 90 })).toEqual({ kind: "complete", percent: 75 });
    expect(finalScore({ 1: 80, 2: null, 3: 70 })).toEqual({ kind: "partial", evaluated: 2, total: 4 });
    expect(finalScore({})).toEqual({ kind: "partial", evaluated: 0, total: 4 });
    expect(finalScore({ 1: 0, 2: 0, 3: 0, 4: 0 })).toEqual({ kind: "complete", percent: 0 });
  });
});

describe("bandFor", () => {
  const thresholds = { green: 80, yellow: 60 };

  it.each([
    [100, "green"],
    [80, "green"],
    [79.99, "yellow"],
    [60, "yellow"],
    [59.99, "red"],
    [0, "red"],
  ] as const)("%d → %s", (percent, band) => {
    expect(bandFor(percent, thresholds)).toBe(band);
  });

  it("follows configured thresholds", () => {
    expect(bandFor(84, { green: 85, yellow: 65 })).toBe("yellow");
  });
});

describe("roundScore", () => {
  it.each([
    [72.455, 72.46],
    [72.454, 72.45],
    [89.8, 89.8],
    [100, 100],
    [0.005, 0.01],
    [-1.005, -1.01],
    [2 / 3 * 100, 66.67],
  ])("%d → %d (two decimals, half away from zero)", (value, rounded) => {
    expect(roundScore(value)).toBe(rounded);
  });

  it("refuses a non-finite number", () => {
    expect(() => roundScore(Number.NaN)).toThrow(RangeError);
  });
});
