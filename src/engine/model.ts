import { twinOf, type Card } from './cards.ts';
import { STRENGTH_COUNT } from './evaluate.ts';
import { GENERIC_WIN_BASE64 } from './genericTable.ts';
import {
  expectedPoints,
  makeValueTable,
  optimise,
  type Arrangement,
  type ValueTable,
  type WinTable,
} from './optimiser.ts';
import { HAND_SIZE, ROUNDS, playOrder, rightOf, type Seat } from './rules.ts';
import { shuffleInPlace, type Rng } from './rng.ts';

const QUANT = 65535;

export function encodeWinTable(table: WinTable): string {
  let binary = '';
  for (let i = 0; i < table.length; i++) {
    const q = Math.round(Math.min(1, Math.max(0, table[i])) * QUANT);
    binary += String.fromCharCode(q & 255, q >> 8);
  }
  return btoa(binary);
}

export function decodeWinTable(base64: string): WinTable {
  const binary = atob(base64);
  const table = new Float32Array(binary.length / 2);
  for (let i = 0; i < table.length; i++) {
    table[i] = (binary.charCodeAt(2 * i) | (binary.charCodeAt(2 * i + 1) << 8)) / QUANT;
  }
  return table;
}

let genericWin: WinTable | null = null;
let genericValue: ValueTable | null = null;

/**
 * Win chances by round and strength when all three players arrange their sets well.
 * Produced by self-play (`npm run train`); it does not depend on any particular hand.
 */
export function genericWinTable(): WinTable {
  genericWin ??= decodeWinTable(GENERIC_WIN_BASE64);
  if (genericWin.length !== ROUNDS * STRENGTH_COUNT) throw new Error('The generic win table has the wrong size.');
  return genericWin;
}

export function genericValueTable(): ValueTable {
  genericValue ??= makeValueTable(genericWinTable());
  return genericValue;
}

/** What one player knows before arranging their sets. */
export interface PlayerView {
  /** The player's own 17 or 18 cards, before discarding. */
  hand: Card[];
  /** Cards known to be held by the opponent on the right and on the left. */
  known: [Card[], Card[]];
  /** Hand sizes of the right and left opponents, or null when it is unknown who holds 18 cards. */
  sizes: [number, number] | null;
  /** Chance of winning an exact tie in round 1 against the right and the left opponent. */
  roundOneTieWin: [number, number];
}

export interface TableInfo {
  seat: Seat;
  dealer: Seat;
  /** The card opened at the centre. */
  centre: Card;
  /** The seat that picked the centre card up. */
  recipient: Seat;
}

/** Builds a player's view from the public information at the table. */
export function viewFromTable(hand: readonly Card[], info: TableInfo): PlayerView {
  const right = rightOf(info.seat);
  const left = rightOf(right);
  const known: [Card[], Card[]] = [[], []];
  const sizes: [number, number] = [HAND_SIZE, HAND_SIZE];
  if (info.recipient !== info.seat) {
    const index = info.recipient === right ? 0 : 1;
    known[index] = [info.centre, twinOf(info.centre)];
    sizes[index] = HAND_SIZE + 1;
  }
  const order = playOrder(rightOf(info.dealer));
  const position = (seat: Seat) => order.indexOf(seat);
  const tieWin = (opponent: Seat) => (position(info.seat) > position(opponent) ? 1 : 0);
  return { hand: [...hand], known, sizes, roundOneTieWin: [tieWin(right), tieWin(left)] };
}

export type Neighbour = 'right' | 'left';

/** What a player at a real table can tell the optimiser beyond their own cards. All of it is optional. */
export interface TableDetails {
  /** Who dealt. Play passes to the right, so the dealer plays last in round 1. */
  dealer?: 'me' | Neighbour;
  /** Which opponent picked up the centre card, when the player did not. */
  picker?: Neighbour;
  /** The card that was opened at the centre. */
  centre?: Card;
}

/** Builds a view from a typed-in hand and whatever table details are known. */
export function viewFromDetails(hand: readonly Card[], details: TableDetails = {}): PlayerView {
  const view: PlayerView = { hand: [...hand], known: [[], []], sizes: null, roundOneTieWin: [0.5, 0.5] };
  if (hand.length > HAND_SIZE) {
    view.sizes = [HAND_SIZE, HAND_SIZE];
  } else if (details.picker) {
    const index = details.picker === 'right' ? 0 : 1;
    view.sizes = [HAND_SIZE, HAND_SIZE];
    view.sizes[index] = HAND_SIZE + 1;
    if (details.centre !== undefined) {
      const pair = [details.centre, twinOf(details.centre)];
      if (pair.some((card) => hand.includes(card))) {
        throw new Error('The centre card and its twin cannot be in your hand when another player picked it up.');
      }
      view.known[index] = pair;
    }
  }
  // Ties in round 1 go to whoever plays later: the dealer is last, the player on the dealer's right is first.
  if (details.dealer === 'me') view.roundOneTieWin = [1, 1];
  else if (details.dealer === 'right') view.roundOneTieWin = [0, 1];
  else if (details.dealer === 'left') view.roundOneTieWin = [0, 0];
  return view;
}

/**
 * Deals the unseen cards to the two opponents `count` times and lets each opponent arrange
 * their hand with `opponentValue`. Returns 10 strengths per sample: the right opponent's
 * five rounds, then the left opponent's.
 */
export function sampleOpponents(
  view: PlayerView,
  count: number,
  rng: Rng,
  opponentValue: ValueTable = genericValueTable(),
): Uint16Array {
  const held = new Set<Card>([...view.hand, ...view.known[0], ...view.known[1]]);
  const pool: Card[] = [];
  for (let card = 0; card < 52; card++) if (!held.has(card)) pool.push(card);

  const out = new Uint16Array(count * 2 * ROUNDS);
  for (let sample = 0; sample < count; sample++) {
    shuffleInPlace(pool, rng);
    let rightSize: number;
    if (view.sizes) {
      rightSize = view.sizes[0];
    } else {
      rightSize = rng() < 0.5 ? HAND_SIZE + 1 : HAND_SIZE;
    }
    const takeRight = rightSize - view.known[0].length;
    const hands = [
      [...view.known[0], ...pool.slice(0, takeRight)],
      [...view.known[1], ...pool.slice(takeRight)],
    ];
    for (let opponent = 0; opponent < 2; opponent++) {
      const { strengths } = optimise(hands[opponent], opponentValue);
      for (let round = 0; round < ROUNDS; round++) {
        out[(sample * 2 + opponent) * ROUNDS + round] = strengths[round];
      }
    }
  }
  return out;
}

export interface Prior {
  table: WinTable;
  /** How many samples the prior counts for. */
  weight: number;
}

/**
 * Turns opponent samples into win chances for this player. Exact ties in round 1 are
 * settled by the known playing order; in later rounds the order depends on who won the
 * round before, so a tie counts as an even chance.
 */
export function buildWinTable(
  samples: Uint16Array,
  roundOneTieWin: readonly [number, number],
  prior?: Prior,
): WinTable {
  const count = samples.length / (2 * ROUNDS);
  const table = new Float32Array(ROUNDS * STRENGTH_COUNT);
  const above = new Float64Array(STRENGTH_COUNT + 1);
  const tie = new Float64Array(STRENGTH_COUNT);
  const priorWeight = prior?.weight ?? 0;

  for (let round = 0; round < ROUNDS; round++) {
    above.fill(0);
    tie.fill(0);
    const tieRight = round === 0 ? roundOneTieWin[0] : 0.5;
    const tieLeft = round === 0 ? roundOneTieWin[1] : 0.5;
    for (let sample = 0; sample < count; sample++) {
      const right = samples[sample * 2 * ROUNDS + round];
      const left = samples[(sample * 2 + 1) * ROUNDS + round];
      const top = Math.max(right, left);
      above[top + 1] += 1;
      tie[top] += right === left ? tieRight * tieLeft : right > left ? tieRight : tieLeft;
    }
    let running = 0;
    for (let s = 0; s < STRENGTH_COUNT; s++) {
      running += above[s];
      const i = round * STRENGTH_COUNT + s;
      const sampled = running + tie[s];
      table[i] = (sampled + priorWeight * (prior ? prior.table[i] : 0)) / (count + priorWeight);
    }
  }
  return table;
}

export interface SolveOptions {
  samples?: number;
  rng: Rng;
  /** Points weight of each round; the true game uses 1, 2, 3, 4, 5. */
  weights?: readonly number[];
}

export interface Solution {
  arrangement: Arrangement;
  /** This player's win chances by round and strength, given their own cards. */
  win: WinTable;
  /** Expected points of the arrangement out of 15. */
  expected: number;
}

export const DEFAULT_SAMPLES = 240;
export const PRIOR_WEIGHT = 8;

/**
 * Estimates this player's win chances against two smart opponents. The self-play table
 * counts as `priorWeight` extra samples, which smooths the estimate between sampled values.
 */
export function estimateWinTable(view: PlayerView, samples: number, rng: Rng, priorWeight = PRIOR_WEIGHT): WinTable {
  const opponents = sampleOpponents(view, samples, rng);
  return buildWinTable(opponents, view.roundOneTieWin, { table: genericWinTable(), weight: priorWeight });
}

/** Averages win tables that were estimated separately, weighting each by its number of samples. */
export function mergeWinTables(tables: readonly WinTable[], samples: readonly number[]): WinTable {
  const total = samples.reduce((a, b) => a + b, 0);
  const merged = new Float32Array(tables[0].length);
  tables.forEach((table, t) => {
    const share = samples[t] / total;
    for (let i = 0; i < merged.length; i++) merged[i] += table[i] * share;
  });
  return merged;
}

/** Splits `samples` into `parts` nearly equal whole numbers, dropping empty parts. */
export function splitSamples(samples: number, parts: number): number[] {
  const count = Math.max(1, Math.min(parts, samples));
  return Array.from({ length: count }, (_, i) => Math.floor(samples / count) + (i < samples % count ? 1 : 0));
}

/** The instant answer: the best arrangement against typical smart play, with no simulation. */
export function solveInstant(hand: readonly Card[]): Solution {
  const win = genericWinTable();
  const arrangement = optimise(hand, genericValueTable());
  return { arrangement, win, expected: expectedPoints(arrangement.strengths, win) };
}

/** Full optimiser: the discards and five sets with the highest expected points. */
export function solve(view: PlayerView, options: SolveOptions): Solution {
  const win = estimateWinTable(view, options.samples ?? DEFAULT_SAMPLES, options.rng);
  const arrangement = optimise(view.hand, makeValueTable(win, options.weights));
  return { arrangement, win, expected: expectedPoints(arrangement.strengths, win) };
}
