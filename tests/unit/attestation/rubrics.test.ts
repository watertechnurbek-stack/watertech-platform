import { describe, expect, it } from "vitest";
import ru from "@/messages/ru.json";
import uz from "@/messages/uz.json";
import { RUBRICS, RUBRIC_MESSAGES, rubricFor } from "@/lib/attestation/rubrics";
import { ASSESSMENT_DAYS } from "@/lib/attestation/types";

type Messages = { [key: string]: string | Messages };

function lookup(tree: Messages, dotted: string): string | undefined {
  let node: string | Messages | undefined = tree;
  for (const key of dotted.split(".")) {
    if (typeof node !== "object") return undefined;
    node = node[key];
  }
  return typeof node === "string" ? node : undefined;
}

// docs/ATTESTATION.md §4 — the criteria and weights the owner agreed, by day.
const EXPECTED: Record<number, [string, number][]> = {
  1: [
    ["greeting", 15],
    ["companyFacts", 25],
    ["productLines", 25],
    ["needsDiscovery", 15],
    ["nextStep", 10],
    ["courtesy", 10],
  ],
  2: [
    ["technicalAccuracy", 35],
    ["technicalDiscovery", 20],
    ["competitorComparison", 15],
    ["clarity", 15],
    ["nextStep", 15],
  ],
  3: [
    ["segmentDiscovery", 25],
    ["crmNextStep", 20],
    ["termsAccuracy", 25],
    ["objectionHandling", 15],
    ["communication", 15],
  ],
  4: [
    ["opening", 10],
    ["needsDiscovery", 15],
    ["valuePresentation", 15],
    ["objections", 25],
    ["factualAccuracy", 15],
    ["close", 15],
    ["standards", 5],
  ],
};

describe.each(ASSESSMENT_DAYS.map((day) => [day] as const))("day %i rubric", (day) => {
  const rubric = rubricFor(day);

  it("is the agreed criteria with the agreed weights, in order", () => {
    expect(rubric.day).toBe(day);
    expect(rubric.criteria.map((criterion) => [criterion.id, criterion.weight])).toEqual(EXPECTED[day]);
  });

  it("weighs 100 in integers, with unique ids", () => {
    expect(rubric.criteria.reduce((sum, criterion) => sum + criterion.weight, 0)).toBe(100);
    for (const criterion of rubric.criteria) expect(Number.isInteger(criterion.weight)).toBe(true);
    expect(new Set(rubric.criteria.map((criterion) => criterion.id)).size).toBe(rubric.criteria.length);
  });

  it("labels every criterion in both languages", () => {
    for (const criterion of rubric.criteria) {
      expect(criterion.labelKey).toBe(`${RUBRIC_MESSAGES}.day${day}.${criterion.id}`);
      for (const [locale, messages] of [["uz", uz], ["ru", ru]] as const) {
        expect(lookup(messages, criterion.labelKey)?.trim(), `${locale}: ${criterion.labelKey}`).toBeTruthy();
      }
    }
  });

  it("tells the evaluator in one line what a full score looks like", () => {
    for (const criterion of rubric.criteria) {
      expect(criterion.goodLooksLike.trim().length).toBeGreaterThan(20);
      expect(criterion.goodLooksLike).not.toContain("\n");
    }
  });
});

it("has exactly the four days", () => {
  expect(Object.keys(RUBRICS).map(Number)).toEqual([...ASSESSMENT_DAYS]);
});
