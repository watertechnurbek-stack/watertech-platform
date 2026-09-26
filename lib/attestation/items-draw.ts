import "server-only";
import type { ItemDifficulty } from "./types";

// Which Part A items an attempt gets (docs/ATTESTATION.md §10). Pure and
// deterministic for a seed — S05 seeds with the attempt id, so a draw can be
// replayed — and independent of the order the pool arrives in.
//
//   1. Items the person has not seen (in earlier, archived attempts) first;
//      seen ones only when the unseen are not enough.
//   2. Balanced: every pick goes to the topic with the fewest picks so far
//      (ties by a seeded topic order), and within it to the item whose
//      difficulty has the fewest picks so far (ties by a seeded item order).
//   3. The picks are shuffled once more, so the order a candidate meets them
//      in says nothing about topic or difficulty.

export interface DrawCandidate {
  id: string;
  topic: string;
  difficulty: ItemDifficulty;
}

export interface DrawInput {
  /** The day's published items. */
  pool: readonly DrawCandidate[];
  /** How many to draw (day_settings[d].itemCount). */
  count: number;
  /** Any string; the attempt id in practice. */
  seed: string;
  /** Ids the person was served before — avoided while the pool allows. */
  seen?: readonly string[];
}

export interface DrawResult {
  /** In presentation order. */
  ids: string[];
  /** How many of them the person had seen before. */
  reusedSeen: number;
  /** How many short of `count` the pool fell. */
  shortfall: number;
}

/** 32-bit FNV-1a of the seed: a well-mixed PRNG state from any string. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, and identical on every JS engine (Math.imul). */
export function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const held = out[i];
    const swap = out[j];
    if (held === undefined || swap === undefined) continue;
    out[i] = swap;
    out[j] = held;
  }
  return out;
}

interface Tally {
  topics: Map<string, number>;
  difficulties: Map<ItemDifficulty, number>;
}

/** Moves up to `wanted` items from `candidates` into `picked`, balancing on
 * the running tally (shared across the unseen and the seen tier). */
function pickBalanced(
  candidates: readonly DrawCandidate[],
  wanted: number,
  random: () => number,
  tally: Tally,
  picked: DrawCandidate[]
): number {
  // Topic order and item order within a topic come from one seeded shuffle.
  const byTopic = new Map<string, DrawCandidate[]>();
  for (const item of shuffled(candidates, random)) {
    const list = byTopic.get(item.topic) ?? [];
    list.push(item);
    byTopic.set(item.topic, list);
  }
  const topicOrder = [...byTopic.keys()];

  let taken = 0;
  while (taken < wanted) {
    let topic: string | null = null;
    for (const candidate of topicOrder) {
      if ((byTopic.get(candidate)?.length ?? 0) === 0) continue;
      if (topic === null || (tally.topics.get(candidate) ?? 0) < (tally.topics.get(topic) ?? 0)) topic = candidate;
    }
    if (topic === null) break;

    const list = byTopic.get(topic) ?? [];
    let index = 0;
    for (let i = 1; i < list.length; i += 1) {
      const current = list[i];
      const best = list[index];
      if (current && best && (tally.difficulties.get(current.difficulty) ?? 0) < (tally.difficulties.get(best.difficulty) ?? 0)) {
        index = i;
      }
    }
    const [item] = list.splice(index, 1);
    if (!item) break;

    picked.push(item);
    tally.topics.set(item.topic, (tally.topics.get(item.topic) ?? 0) + 1);
    tally.difficulties.set(item.difficulty, (tally.difficulties.get(item.difficulty) ?? 0) + 1);
    taken += 1;
  }
  return taken;
}

export function drawItems(input: DrawInput): DrawResult {
  if (!Number.isInteger(input.count) || input.count < 0) {
    throw new RangeError(`drawItems: count must be a non-negative integer, got ${input.count}`);
  }

  // One entry per id, sorted, so the arrival order of the pool cannot change
  // the draw.
  const unique = new Map<string, DrawCandidate>();
  for (const item of input.pool) if (!unique.has(item.id)) unique.set(item.id, item);
  const pool = [...unique.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const seen = new Set(input.seen ?? []);
  const random = seededRandom(input.seed);
  const tally: Tally = { topics: new Map(), difficulties: new Map() };
  const picked: DrawCandidate[] = [];

  pickBalanced(pool.filter((item) => !seen.has(item.id)), input.count, random, tally, picked);
  const reusedSeen = pickBalanced(pool.filter((item) => seen.has(item.id)), input.count - picked.length, random, tally, picked);

  return {
    ids: shuffled(picked, random).map((item) => item.id),
    reusedSeen,
    shortfall: input.count - picked.length,
  };
}
