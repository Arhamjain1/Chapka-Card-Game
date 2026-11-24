import { ACE, RANK_LABELS, rankOf, suitOf, type Card } from './cards.ts';

export const SET_TYPES = ['high', 'pair', 'suite', 'impure', 'pure', 'trail'] as const;
export type SetType = (typeof SET_TYPES)[number];

export const SET_TYPE_LABELS: Record<SetType, string> = {
  trail: 'Three of a Kind',
  pure: 'Pure Sequence',
  impure: 'Impure Sequence',
  suite: 'Suite',
  pair: 'Pair',
  high: 'High Card',
};

const NON_SEQUENCE_COMBOS = 274;
const SEQUENCES = 12;

/** Every distinct strength maps to one integer; a higher integer is a stronger set. */
const OFFSET: Record<SetType, number> = {
  high: 0,
  pair: NON_SEQUENCE_COMBOS,
  suite: NON_SEQUENCE_COMBOS + 156,
  impure: 2 * NON_SEQUENCE_COMBOS + 156,
  pure: 2 * NON_SEQUENCE_COMBOS + 156 + SEQUENCES,
  trail: 2 * NON_SEQUENCE_COMBOS + 156 + 2 * SEQUENCES,
};

export const STRENGTH_COUNT = OFFSET.trail + 13;

/**
 * Sequence order, low to high: 4-3-2 (0) ... K-Q-J (9), A-2-3 (10), A-K-Q (11).
 * Returns -1 when the three distinct ranks are not a sequence.
 */
function sequenceIndex(hi: number, mid: number, lo: number): number {
  if (hi === ACE && mid === 1 && lo === 0) return 10;
  if (hi - mid === 1 && mid - lo === 1) return hi === ACE ? 11 : lo;
  return -1;
}

/** Index of a non-sequence combination of three distinct ranks, ordered by high, middle, low card. */
const COMBO_INDEX = new Int16Array(13 * 13 * 13).fill(-1);
{
  let next = 0;
  for (let hi = 2; hi < 13; hi++) {
    for (let mid = 1; mid < hi; mid++) {
      for (let lo = 0; lo < mid; lo++) {
        if (sequenceIndex(hi, mid, lo) < 0) COMBO_INDEX[hi * 169 + mid * 13 + lo] = next++;
      }
    }
  }
}

export function strengthOf(a: Card, b: Card, c: Card): number {
  let hi = a >> 2;
  let mid = b >> 2;
  let lo = c >> 2;
  let swap: number;
  if (hi < mid) { swap = hi; hi = mid; mid = swap; }
  if (mid < lo) { swap = mid; mid = lo; lo = swap; }
  if (hi < mid) { swap = hi; hi = mid; mid = swap; }

  if (hi === lo) return OFFSET.trail + hi;
  if (hi === mid) return OFFSET.pair + hi * 12 + lo;
  if (mid === lo) return OFFSET.pair + mid * 12 + hi - 1;

  const sameSuit = (a & 3) === (b & 3) && (b & 3) === (c & 3);
  const sequence = sequenceIndex(hi, mid, lo);
  if (sequence >= 0) return (sameSuit ? OFFSET.pure : OFFSET.impure) + sequence;
  return (sameSuit ? OFFSET.suite : OFFSET.high) + COMBO_INDEX[hi * 169 + mid * 13 + lo];
}

export function strengthOfSet(cards: readonly Card[]): number {
  if (cards.length !== 3) throw new Error('A set has exactly 3 cards.');
  return strengthOf(cards[0], cards[1], cards[2]);
}

export function typeOfStrength(strength: number): SetType {
  if (strength >= OFFSET.trail) return 'trail';
  if (strength >= OFFSET.pure) return 'pure';
  if (strength >= OFFSET.impure) return 'impure';
  if (strength >= OFFSET.suite) return 'suite';
  if (strength >= OFFSET.pair) return 'pair';
  return 'high';
}

export interface SetInfo {
  type: SetType;
  strength: number;
  label: string;
  /** Short description of the ranks, for example "A-K-Q" or "9s, A kicker". */
  detail: string;
}

export function describeSet(cards: readonly Card[]): SetInfo {
  const strength = strengthOfSet(cards);
  const type = typeOfStrength(strength);
  const ranks = cards.map(rankOf).sort((x, y) => y - x);
  const names = ranks.map((r) => RANK_LABELS[r]);
  let detail: string;
  if (type === 'trail') {
    detail = `${names[0]}s`;
  } else if (type === 'pair') {
    const pair = ranks[0] === ranks[1] ? ranks[0] : ranks[1];
    const kicker = ranks[0] === ranks[1] ? ranks[2] : ranks[0];
    detail = `${RANK_LABELS[pair]}s, ${RANK_LABELS[kicker]} kicker`;
  } else if ((type === 'pure' || type === 'impure') && ranks[0] === ACE && ranks[2] === 0) {
    detail = 'A-2-3';
  } else {
    detail = names.join('-');
  }
  return { type, strength, label: SET_TYPE_LABELS[type], detail };
}

/** Cards ordered for display: pair first for pairs, A-2-3 as A, 2, 3, otherwise high to low. */
export function orderSetForDisplay(cards: readonly Card[]): Card[] {
  const sorted = [...cards].sort((x, y) => rankOf(y) - rankOf(x) || suitOf(x) - suitOf(y));
  const ranks = sorted.map(rankOf);
  if (ranks[1] === ranks[2] && ranks[0] !== ranks[1]) return [sorted[1], sorted[2], sorted[0]];
  if (ranks[0] === ACE && ranks[1] === 1 && ranks[2] === 0) return [sorted[0], sorted[2], sorted[1]];
  return sorted;
}

/** True when the strengths never increase from round 1 to round 5. */
export function isDescending(strengths: readonly number[]): boolean {
  for (let i = 1; i < strengths.length; i++) {
    if (strengths[i] > strengths[i - 1]) return false;
  }
  return true;
}
