import { describe, expect, it } from "vitest";
import {
  HEALTH_SEGMENTS,
  KNOWLEDGE_PATH,
  KNOWLEDGE_SECTIONS,
  gapKpi,
  knowledgeHref,
  mergeKnowledgeGaps,
  parseHealthSegment,
  sumCounts,
} from "@/lib/admin/knowledge";
import type { UnansweredQuestion } from "@/lib/dashboard/copilot";
import type { ZeroResultQueryGroup } from "@/lib/dashboard/quality";

// "Bilim sifati" (S03): the page's links, the merge of the two "no answer"
// sources, and the overview's knowledge-gaps number.

function search(query: string, count: number, lastSeenIso: string): ZeroResultQueryGroup {
  return { query, count, lastSeenIso };
}

function asked(question: string, count: number, operatorCount: number, lastAskedIso: string): UnansweredQuestion {
  return { key: question.toLowerCase(), question, count, operatorCount, lastAskedIso };
}

describe("knowledgeHref", () => {
  it("builds the page URL with the range, extra params and the section", () => {
    expect(knowledgeHref("")).toBe(KNOWLEDGE_PATH);
    expect(knowledgeHref("", "gaps")).toBe("/admin/knowledge#gaps");
    expect(knowledgeHref("from=2026-09-01&to=2026-09-25", "health", { health: "stale" })).toBe(
      "/admin/knowledge?from=2026-09-01&to=2026-09-25&health=stale#health"
    );
  });

  it("names the page's sections in page order", () => {
    expect(KNOWLEDGE_SECTIONS).toEqual(["gaps", "feedback", "health", "usage", "copilot"]);
  });
});

describe("parseHealthSegment", () => {
  it("accepts the three lists and falls back to drafts", () => {
    for (const segment of HEALTH_SEGMENTS) expect(parseHealthSegment(segment)).toBe(segment);
    expect(parseHealthSegment(["stale", "drafts"])).toBe("stale");
    expect(parseHealthSegment(undefined)).toBe("drafts");
    expect(parseHealthSegment("<script>")).toBe("drafts");
  });
});

describe("mergeKnowledgeGaps", () => {
  it("merges the two sources on normalized wording — case, apostrophes, Cyrillic, punctuation", () => {
    const gaps = mergeKnowledgeGaps(
      [search("kafolat muddati", 2, "2026-09-20T08:00:00.000Z"), search("o'rnatish narxi", 1, "2026-09-19T08:00:00.000Z")],
      [
        asked("Kafolat muddati?", 3, 2, "2026-09-24T08:00:00.000Z"),
        asked("O‘rnatish narxi", 1, 1, "2026-09-18T08:00:00.000Z"),
        asked("кафолат муддати", 1, 1, "2026-09-10T08:00:00.000Z"),
      ]
    );

    expect(gaps).toEqual([
      {
        key: "kafolat muddati",
        // The newest wording wins.
        text: "Kafolat muddati?",
        total: 6,
        searches: 2,
        copilot: 4,
        // Two Copilot groups folded together: at least the larger of the two.
        copilotPeople: 2,
        lastSeenIso: "2026-09-24T08:00:00.000Z",
      },
      {
        key: "ornatish narxi",
        text: "o'rnatish narxi",
        total: 2,
        searches: 1,
        copilot: 1,
        copilotPeople: 1,
        lastSeenIso: "2026-09-19T08:00:00.000Z",
      },
    ]);
  });

  it("keeps who asked unknown for a search-only gap", () => {
    const [gap] = mergeKnowledgeGaps([search("filtr", 4, "2026-09-20T08:00:00.000Z")], []);
    expect(gap).toMatchObject({ searches: 4, copilot: 0, copilotPeople: null });
  });

  it("orders by total, then the newest, then the wording, and drops empty or zero rows", () => {
    const gaps = mergeKnowledgeGaps(
      [
        search("b", 2, "2026-09-20T08:00:00.000Z"),
        search("a", 2, "2026-09-20T08:00:00.000Z"),
        search("c", 2, "2026-09-22T08:00:00.000Z"),
        search("???", 9, "2026-09-22T08:00:00.000Z"),
        search("zero", 0, "2026-09-22T08:00:00.000Z"),
      ],
      [asked("d", 5, 1, "2026-09-01T08:00:00.000Z")]
    );
    expect(gaps.map((gap) => gap.key)).toEqual(["d", "c", "a", "b"]);
  });

  it("is empty for two empty sources", () => {
    expect(mergeKnowledgeGaps([], [])).toEqual([]);
  });
});

describe("gapKpi", () => {
  it("adds the three parts and compares the total with the previous window", () => {
    expect(gapKpi({ searches: 6, feedback: 2, copilot: 4 }, { searches: 3, feedback: 2, copilot: 3 })).toEqual({
      total: 12,
      searches: 6,
      feedback: 2,
      copilot: 4,
      delta: 50,
    });
  });

  it("is null when any current part is unknown — a partial sum would read as fewer gaps", () => {
    expect(gapKpi({ searches: 6, feedback: null, copilot: 4 }, { searches: 1, feedback: 1, copilot: 1 })).toBeNull();
  });

  it("has no delta when a previous part is unknown or the previous total was 0", () => {
    expect(gapKpi({ searches: 1, feedback: 0, copilot: 0 }, { searches: null, feedback: 1, copilot: 1 })?.delta).toBeNull();
    expect(gapKpi({ searches: 1, feedback: 0, copilot: 0 }, { searches: 0, feedback: 0, copilot: 0 })?.delta).toBeNull();
  });
});

describe("sumCounts", () => {
  it("sums a ranked list's counts", () => {
    expect(sumCounts([{ count: 3 }, { count: 2 }])).toBe(5);
    expect(sumCounts([])).toBe(0);
  });
});
