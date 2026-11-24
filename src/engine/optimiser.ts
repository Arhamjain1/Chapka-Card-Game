import type { Card } from './cards.ts';
import { STRENGTH_COUNT, orderSetForDisplay, strengthOf } from './evaluate.ts';
import { ROUNDS, ROUND_POINTS, SET_SIZE } from './rules.ts';

export const MIN_CARDS = ROUNDS * SET_SIZE;
export const MAX_CARDS = 18;

/**
 * Win probabilities by round and strength: `table[round * STRENGTH_COUNT + strength]`
 * is the chance that a set of that strength wins that round.
 */
export type WinTable = Float32Array;

/** A win table multiplied by the points of each round; this is what the search maximises. */
export type ValueTable = Float32Array;

export interface Arrangement {
  /** Five sets of three cards, round 1 first, never increasing in strength. */
  sets: Card[][];
  strengths: number[];
  discards: Card[];
  /** Sum of the value table entries of the five sets. */
  value: number;
}

/**
 * Converts win probabilities into search values. A very small bonus for stronger sets
 * breaks ties between arrangements whose win chances are identical.
 */
export function makeValueTable(
  win: WinTable,
  weights: readonly number[] = ROUND_POINTS,
  tieBreak = 5e-4,
): ValueTable {
  const value = new Float32Array(ROUNDS * STRENGTH_COUNT);
  for (let round = 0; round < ROUNDS; round++) {
    for (let s = 0; s < STRENGTH_COUNT; s++) {
      const i = round * STRENGTH_COUNT + s;
      value[i] = weights[round] * (win[i] + (tieBreak * s) / STRENGTH_COUNT);
    }
  }
  return value;
}

/** Expected points of an arrangement under a win table. */
export function expectedPoints(strengths: readonly number[], win: WinTable): number {
  let total = 0;
  for (let round = 0; round < ROUNDS; round++) {
    total += ROUND_POINTS[round] * win[round * STRENGTH_COUNT + strengths[round]];
  }
  return total;
}

interface Workspace {
  /** levels[j] lists every card mask holding exactly 3 * j cards, for j = 0..4. */
  levels: Int32Array[];
  best: Float32Array;
  /** The step that produced the current best value of each mask. */
  stepOf: Int32Array;
  /** Append-only record of improvements: the set that was added and the step it was added to. */
  stepTriple: Int16Array;
  stepPrevious: Int32Array;
}

const workspaces = new Map<number, Workspace>();

function popcount(x: number): number {
  x -= (x >> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333);
  return (((x + (x >> 4)) & 0x0f0f0f0f) * 0x01010101) >> 24;
}

function workspaceFor(cardCount: number): Workspace {
  let workspace = workspaces.get(cardCount);
  if (!workspace) {
    const buckets: number[][] = [[], [], [], [], []];
    const size = 1 << cardCount;
    for (let mask = 0; mask < size; mask++) {
      const count = popcount(mask);
      if (count % SET_SIZE === 0 && count < MIN_CARDS) buckets[count / SET_SIZE].push(mask);
    }
    workspace = {
      levels: buckets.map((bucket) => Int32Array.from(bucket)),
      best: new Float32Array(size),
      stepOf: new Int32Array(size),
      stepTriple: new Int16Array(1 << 16),
      stepPrevious: new Int32Array(1 << 16),
    };
    workspaces.set(cardCount, workspace);
  }
  return workspace;
}

/**
 * Finds the arrangement with the highest total value: which cards to discard and how to
 * split the other 15 into five sets, with the sets forced into descending strength.
 *
 * The search is exact. All three-card sets of the hand are visited from strongest to
 * weakest, so the k-th set added to a partial arrangement is always its k-th strongest
 * and therefore belongs to round k. `best[mask]` holds the best value of any partial
 * arrangement that uses exactly the cards in `mask`.
 *
 * Every improvement is recorded as a step that points back to the step it extended. Steps
 * are never rewritten, so the winning arrangement can be read back exactly even when a
 * mask it passed through is improved again later in the search.
 */
export function optimise(cards: readonly Card[], value: ValueTable): Arrangement {
  const n = cards.length;
  if (n < MIN_CARDS || n > MAX_CARDS) {
    throw new Error(`The optimiser needs ${MIN_CARDS} to ${MAX_CARDS} cards, but got ${n}.`);
  }
  if (new Set(cards).size !== n) throw new Error('The hand contains the same card twice.');

  const workspace = workspaceFor(n);
  const { levels, best, stepOf } = workspace;
  let { stepTriple, stepPrevious } = workspace;
  best.fill(-1);
  best[0] = 0;
  stepOf[0] = 0;
  stepPrevious[0] = -1;
  let stepCount = 1;

  const tripleCount = (n * (n - 1) * (n - 2)) / 6;
  const tripleMask = new Int32Array(tripleCount);
  const tripleStrength = new Uint16Array(tripleCount);
  let t = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      for (let k = j + 1; k < n; k++) {
        tripleMask[t] = (1 << i) | (1 << j) | (1 << k);
        tripleStrength[t] = strengthOf(cards[i], cards[j], cards[k]);
        t++;
      }
    }
  }
  const order = Array.from({ length: tripleCount }, (_, i) => i).sort(
    (a, b) => tripleStrength[b] - tripleStrength[a],
  );

  /** suffix[j * STRENGTH_COUNT + s]: the most that rounds j+1..5 can add when every set is at most s. */
  const suffix = new Float32Array((ROUNDS + 1) * STRENGTH_COUNT);
  for (let round = ROUNDS - 1; round >= 0; round--) {
    let running = 0;
    for (let s = 0; s < STRENGTH_COUNT; s++) {
      running = Math.max(running, value[round * STRENGTH_COUNT + s]);
      suffix[round * STRENGTH_COUNT + s] = running + suffix[(round + 1) * STRENGTH_COUNT + s];
    }
  }

  const levelMax = [0, -1, -1, -1, -1];
  let bestValue = -1;
  let bestStep = 0;
  let bestTriple = -1;
  const lastLevel = levels[ROUNDS - 1];

  for (let oi = 0; oi < tripleCount; oi++) {
    const triple = order[oi];
    const mask = tripleMask[triple];
    const strength = tripleStrength[triple];

    if (levelMax[ROUNDS - 1] >= 0) {
      const gain = value[(ROUNDS - 1) * STRENGTH_COUNT + strength];
      if (levelMax[ROUNDS - 1] + gain > bestValue) {
        for (let i = 0; i < lastLevel.length; i++) {
          const used = lastLevel[i];
          if ((used & mask) !== 0) continue;
          const before = best[used];
          if (before < 0) continue;
          if (before + gain > bestValue) {
            bestValue = before + gain;
            bestStep = stepOf[used];
            bestTriple = triple;
          }
        }
      }
    }

    for (let level = ROUNDS - 2; level >= 0; level--) {
      if (levelMax[level] < 0) continue;
      if (levelMax[level] + suffix[level * STRENGTH_COUNT + strength] <= bestValue) continue;
      const gain = value[level * STRENGTH_COUNT + strength];
      const sources = levels[level];
      let reachedMax = levelMax[level + 1];
      for (let i = 0; i < sources.length; i++) {
        const used = sources[i];
        if ((used & mask) !== 0) continue;
        const before = best[used];
        if (before < 0) continue;
        const total = before + gain;
        const next = used | mask;
        if (total > best[next]) {
          if (stepCount === stepTriple.length) {
            const moreTriples = new Int16Array(stepCount * 2);
            moreTriples.set(stepTriple);
            workspace.stepTriple = stepTriple = moreTriples;
            const morePrevious = new Int32Array(stepCount * 2);
            morePrevious.set(stepPrevious);
            workspace.stepPrevious = stepPrevious = morePrevious;
          }
          best[next] = total;
          stepTriple[stepCount] = triple;
          stepPrevious[stepCount] = stepOf[used];
          stepOf[next] = stepCount++;
          if (total > reachedMax) reachedMax = total;
        }
      }
      levelMax[level + 1] = reachedMax;
    }
  }

  const chosen: number[] = [bestTriple];
  for (let step = bestStep; stepPrevious[step] >= 0; step = stepPrevious[step]) chosen.push(stepTriple[step]);
  chosen.reverse();

  let usedCards = 0;
  const sets = chosen.map((triple) => {
    usedCards |= tripleMask[triple];
    const set: Card[] = [];
    for (let i = 0; i < n; i++) if (tripleMask[triple] & (1 << i)) set.push(cards[i]);
    return orderSetForDisplay(set);
  });
  const discards = cards.filter((_, i) => (usedCards & (1 << i)) === 0);

  return { sets, strengths: chosen.map((triple) => tripleStrength[triple]), discards, value: bestValue };
}
