import { fullDeck, twinOf, type Card } from './cards.ts';
import { isDescending, strengthOfSet } from './evaluate.ts';
import { shuffleInPlace, type Rng } from './rng.ts';

/** Seat 0 is at the bottom of the table, seat 1 top-left, seat 2 top-right. */
export type Seat = 0 | 1 | 2;
export const SEATS: readonly Seat[] = [0, 1, 2];

export const ROUNDS = 5;
export const SET_SIZE = 3;
export const HAND_SIZE = 17;
export const ROUND_POINTS: readonly number[] = [1, 2, 3, 4, 5];
export const TOTAL_POINTS = 15;

/** Play is anticlockwise: the turn passes to the player on the right (0 -> 2 -> 1 -> 0). */
const RIGHT_OF: readonly Seat[] = [2, 0, 1];
export const rightOf = (seat: Seat): Seat => RIGHT_OF[seat];

/** The three seats in playing order, starting from `first`. */
export function playOrder(first: Seat): [Seat, Seat, Seat] {
  const second = rightOf(first);
  return [first, second, rightOf(second)];
}

/**
 * Round 1: the player to the dealer's right plays first, so the dealer is last.
 * Later rounds: the player to the previous winner's right plays first, so that winner is last.
 */
export function firstToPlay(dealer: Seat, previousWinner: Seat | null): Seat {
  return rightOf(previousWinner ?? dealer);
}

/** The strongest set wins. Exactly equal sets go to the player who played last among them. */
export function roundWinner(strengths: readonly number[], order: readonly Seat[]): Seat {
  let winner = order[0];
  for (const seat of order) {
    if (strengths[seat] >= strengths[winner]) winner = seat;
  }
  return winner;
}

export interface Deal {
  hands: [Card[], Card[], Card[]];
  centre: Card;
  /** The seat holding the centre card's twin, who picks the centre card up. */
  recipient: Seat;
}

export function dealCards(rng: Rng): Deal {
  const deck = shuffleInPlace(fullDeck(), rng);
  const hands: [Card[], Card[], Card[]] = [[], [], []];
  for (let i = 0; i < HAND_SIZE * 3; i++) hands[i % 3].push(deck[i]);
  const centre = deck[HAND_SIZE * 3];
  return { hands, centre, recipient: centreRecipient(hands, centre) };
}

export function centreRecipient(hands: readonly (readonly Card[])[], centre: Card): Seat {
  const twin = twinOf(centre);
  const seat = hands.findIndex((hand) => hand.includes(twin));
  if (seat < 0) throw new Error('No player holds the twin of the centre card.');
  return seat as Seat;
}

export function discardCount(handSize: number): number {
  return handSize - ROUNDS * SET_SIZE;
}

export interface ArrangementCheck {
  valid: boolean;
  strengths: number[];
  /** Index of the first set that is stronger than the set before it, or -1. */
  firstOutOfOrder: number;
}

export function checkArrangement(sets: readonly (readonly Card[])[]): ArrangementCheck {
  const complete = sets.length === ROUNDS && sets.every((set) => set.length === SET_SIZE);
  if (!complete) return { valid: false, strengths: [], firstOutOfOrder: -1 };
  const strengths = sets.map(strengthOfSet);
  let firstOutOfOrder = -1;
  for (let i = 1; i < strengths.length; i++) {
    if (strengths[i] > strengths[i - 1]) {
      firstOutOfOrder = i;
      break;
    }
  }
  return { valid: isDescending(strengths), strengths, firstOutOfOrder };
}

export interface RoundResult {
  round: number;
  points: number;
  order: [Seat, Seat, Seat];
  strengths: [number, number, number];
  winner: Seat;
  /** Seats whose set exactly equalled the winning set, including the winner, when there was a tie. */
  tied: Seat[];
}

export function resolveRound(
  round: number,
  strengths: readonly number[],
  dealer: Seat,
  previousWinner: Seat | null,
): RoundResult {
  const order = playOrder(firstToPlay(dealer, previousWinner));
  const winner = roundWinner(strengths, order);
  const tiedSeats = SEATS.filter((seat) => strengths[seat] === strengths[winner]);
  return {
    round,
    points: ROUND_POINTS[round],
    order,
    strengths: [strengths[0], strengths[1], strengths[2]],
    winner,
    tied: tiedSeats.length > 1 ? tiedSeats : [],
  };
}

/** Plays all five rounds for three locked arrangements (indexed by seat, then round). */
export function playAllRounds(strengthsBySeat: readonly (readonly number[])[], dealer: Seat): RoundResult[] {
  const results: RoundResult[] = [];
  let previousWinner: Seat | null = null;
  for (let round = 0; round < ROUNDS; round++) {
    const strengths = SEATS.map((seat) => strengthsBySeat[seat][round]);
    const result = resolveRound(round, strengths, dealer, previousWinner);
    results.push(result);
    previousWinner = result.winner;
  }
  return results;
}

export function totalScores(results: readonly RoundResult[]): [number, number, number] {
  const scores: [number, number, number] = [0, 0, 0];
  for (const result of results) scores[result.winner] += result.points;
  return scores;
}
