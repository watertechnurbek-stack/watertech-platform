import { describe, expect, it } from "vitest";
import { drawItems, seededRandom, type DrawCandidate } from "@/lib/attestation/items-draw";
import type { ItemDifficulty } from "@/lib/attestation/types";

/** Four topics × three difficulties × two items: 24 items. */
function bank(): DrawCandidate[] {
  const items: DrawCandidate[] = [];
  for (const topic of ["company", "product-lines", "value-proposition", "competitor"]) {
    for (const difficulty of [1, 2, 3] as ItemDifficulty[]) {
      for (const n of [1, 2]) items.push({ id: `${topic}-${difficulty}-${n}`, topic, difficulty });
    }
  }
  return items;
}

const byId = new Map(bank().map((item) => [item.id, item]));

function counts(ids: string[], key: "topic" | "difficulty"): number[] {
  const tally = new Map<string | number, number>();
  for (const id of ids) {
    const item = byId.get(id);
    if (!item) throw new Error(`unknown id ${id}`);
    tally.set(item[key], (tally.get(item[key]) ?? 0) + 1);
  }
  return [...tally.values()].sort((a, b) => a - b);
}

describe("seededRandom", () => {
  it("is deterministic per seed, in [0, 1)", () => {
    const a = seededRandom("attempt-1");
    const b = seededRandom("attempt-1");
    const values = Array.from({ length: 50 }, () => a());
    expect(Array.from({ length: 50 }, () => b())).toEqual(values);
    for (const value of values) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(seededRandom("attempt-2")()).not.toBe(seededRandom("attempt-1")());
  });
});

describe("drawItems", () => {
  it("is deterministic for a seed and independent of the pool's order", () => {
    const first = drawItems({ pool: bank(), count: 12, seed: "a0000000-0000-4000-8000-000000000001" });
    const again = drawItems({ pool: [...bank()].reverse(), count: 12, seed: "a0000000-0000-4000-8000-000000000001" });
    expect(again).toEqual(first);
    const other = drawItems({ pool: bank(), count: 12, seed: "a0000000-0000-4000-8000-000000000002" });
    expect(other.ids).not.toEqual(first.ids);
  });

  it("draws distinct items from the pool only", () => {
    const { ids, shortfall, reusedSeen } = drawItems({ pool: bank(), count: 12, seed: "s" });
    expect(ids).toHaveLength(12);
    expect(new Set(ids).size).toBe(12);
    for (const id of ids) expect(byId.has(id)).toBe(true);
    expect(shortfall).toBe(0);
    expect(reusedSeen).toBe(0);
  });

  it.each(["seed-1", "seed-2", "seed-3", "seed-4", "seed-5"])("balances topics and difficulties (%s)", (seed) => {
    const twelve = drawItems({ pool: bank(), count: 12, seed }).ids;
    expect(counts(twelve, "topic")).toEqual([3, 3, 3, 3]);
    expect(counts(twelve, "difficulty")).toEqual([4, 4, 4]);

    // 10 over 4 topics: none may have more than one pick over another.
    const ten = drawItems({ pool: bank(), count: 10, seed }).ids;
    const topics = counts(ten, "topic");
    expect(Math.max(...topics) - Math.min(...topics)).toBeLessThanOrEqual(1);
    const difficulties = counts(ten, "difficulty");
    expect(Math.max(...difficulties) - Math.min(...difficulties)).toBeLessThanOrEqual(1);
  });

  it("avoids items the person has seen while the bank has enough unseen ones", () => {
    const seen = bank()
      .filter((item) => item.id.endsWith("-1"))
      .map((item) => item.id);
    const { ids, reusedSeen } = drawItems({ pool: bank(), count: 12, seed: "retake", seen });
    expect(reusedSeen).toBe(0);
    for (const id of ids) expect(seen).not.toContain(id);
  });

  it("reuses seen items only for what the unseen ones cannot cover", () => {
    const seen = bank()
      .map((item) => item.id)
      .slice(0, 20);
    const { ids, reusedSeen, shortfall } = drawItems({ pool: bank(), count: 12, seed: "retake", seen });
    expect(ids).toHaveLength(12);
    expect(reusedSeen).toBe(8);
    expect(ids.filter((id) => !seen.includes(id))).toHaveLength(4);
    expect(shortfall).toBe(0);
  });

  it("reports a shortfall when the bank is too small, and handles duplicates in the pool", () => {
    const small = bank().slice(0, 5);
    const result = drawItems({ pool: [...small, ...small], count: 12, seed: "short" });
    expect(result.ids).toHaveLength(5);
    expect(result.shortfall).toBe(7);
    expect(drawItems({ pool: [], count: 3, seed: "empty" })).toEqual({ ids: [], reusedSeen: 0, shortfall: 3 });
  });

  it("draws nothing for 0 and refuses a negative or fractional count", () => {
    expect(drawItems({ pool: bank(), count: 0, seed: "zero" }).ids).toEqual([]);
    expect(() => drawItems({ pool: bank(), count: -1, seed: "x" })).toThrow(RangeError);
    expect(() => drawItems({ pool: bank(), count: 1.5, seed: "x" })).toThrow(RangeError);
  });
});
