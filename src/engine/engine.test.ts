import { describe, expect, it } from 'vitest';
import { cardLabel, parseCard, twinOf, type Card } from './cards.ts';
import { STRENGTH_COUNT, describeSet, isDescending, strengthOfSet, typeOfStrength } from './evaluate.ts';
import { buildWinTable, genericWinTable, sampleOpponents, solve, viewFromTable } from './model.ts';
import { expectedPoints, makeValueTable, optimise, type WinTable } from './optimiser.ts';
import {
  ROUNDS,
  centreRecipient,
  checkArrangement,
  dealCards,
  firstToPlay,
  playAllRounds,
  playOrder,
  rightOf,
  roundWinner,
  totalScores,
} from './rules.ts';
import { mulberry32 } from './rng.ts';

const set = (text: string): Card[] => text.split(' ').map(parseCard);
const strength = (text: string): number => strengthOfSet(set(text));

describe('set ranking', () => {
  it('orders the six set types', () => {
    const ladder = ['2S 2H 2D', '4S 3S 2S', 'AS KH QD', 'KS 9S 4S', 'AS AH KD', 'AS KH JD'];
    const strengths = ladder.map(strength);
    expect(strengths.map(typeOfStrength)).toEqual(['trail', 'pure', 'impure', 'suite', 'pair', 'high']);
    expect([...strengths].sort((a, b) => b - a)).toEqual(strengths);
  });

  it('ranks three of a kind from aces down to twos', () => {
    expect(strength('AS AH AD')).toBeGreaterThan(strength('KS KH KD'));
    expect(strength('3S 3H 3D')).toBeGreaterThan(strength('2S 2H 2D'));
    expect(strength('AS AH AD')).toBe(STRENGTH_COUNT - 1);
  });

  it('ranks sequences A-K-Q, then A-2-3, then K-Q-J down to 4-3-2', () => {
    const order = ['AS KS QS', 'AS 2S 3S', 'KS QS JS', 'QS JS 10S', '5S 4S 3S', '4S 3S 2S'].map(strength);
    expect([...order].sort((a, b) => b - a)).toEqual(order);
    expect(new Set(order).size).toBe(order.length);
    expect(strength('AS 2H 3D')).toBeGreaterThan(strength('KS QH JD'));
    expect(strength('AS KH QD')).toBeGreaterThan(strength('AS 2H 3D'));
    expect(typeOfStrength(strength('KS AH 2D'))).toBe('high');
  });

  it('compares suites and high cards card by card', () => {
    expect(strength('KH 9H 4H')).toBeGreaterThan(strength('KS 8S 7S'));
    expect(strength('KH 9D 4H')).toBeGreaterThan(strength('KS 8S 7D'));
    expect(strength('KH 9D 4H')).toBeGreaterThan(strength('KS 9S 3D'));
  });

  it('compares pairs by the pair, then the third card', () => {
    expect(strength('9S 9H AD')).toBeGreaterThan(strength('9D 9C KS'));
    expect(strength('10S 10H 2D')).toBeGreaterThan(strength('9S 9H AD'));
    expect(strength('2S 2H 3D')).toBeGreaterThan(strength('AS KH JD'));
  });

  it('gives equal strength to sets that differ only in suits', () => {
    expect(strength('4S 3H 2D')).toBe(strength('4C 3D 2H'));
    expect(strength('4S 3S 2S')).toBe(strength('4H 3H 2H'));
    expect(describeSet(set('9S 9H AD')).detail).toBe('9s, A kicker');
  });
});

describe('table rules', () => {
  it('pairs each card with the same rank in the other suit of its colour', () => {
    expect(cardLabel(twinOf(parseCard('2H')))).toBe('2♦');
    expect(cardLabel(twinOf(parseCard('AS')))).toBe('A♣');
    expect(twinOf(twinOf(parseCard('7C')))).toBe(parseCard('7C'));
  });

  it('deals 17 cards each and gives the centre card to the holder of its twin', () => {
    const deal = dealCards(mulberry32(3));
    const all = [...deal.hands.flat(), deal.centre];
    expect(deal.hands.map((hand) => hand.length)).toEqual([17, 17, 17]);
    expect(new Set(all).size).toBe(52);
    expect(deal.hands[deal.recipient]).toContain(twinOf(deal.centre));
    expect(centreRecipient(deal.hands, deal.centre)).toBe(deal.recipient);
  });

  it('plays anticlockwise with the dealer last in round 1 and the previous winner last afterwards', () => {
    expect(rightOf(0)).toBe(2);
    expect(playOrder(firstToPlay(0, null))).toEqual([2, 1, 0]);
    expect(playOrder(firstToPlay(1, null))).toEqual([0, 2, 1]);
    expect(playOrder(firstToPlay(1, 2))).toEqual([1, 0, 2]);
  });

  it('gives an exact tie to the player who played last among the tied players', () => {
    expect(roundWinner([100, 100, 50], [0, 2, 1])).toBe(1);
    expect(roundWinner([100, 100, 50], [1, 0, 2])).toBe(0);
    expect(roundWinner([100, 100, 50], [0, 1, 2])).toBe(1);
    expect(roundWinner([100, 100, 100], [2, 1, 0])).toBe(0);
    expect(roundWinner([100, 100, 700], [0, 1, 2])).toBe(2);
  });

  it('scores rounds 1 to 5 as 1 to 5 points and tracks who plays last', () => {
    const results = playAllRounds(
      [
        [700, 600, 500, 400, 300],
        [700, 500, 500, 300, 300],
        [600, 500, 400, 400, 200],
      ],
      1,
    );
    // Round 1 order is 0, 2, 1: seat 1 ties seat 0 and plays last.
    expect(results.map((result) => result.winner)).toEqual([1, 0, 0, 0, 0]);
    expect(results[0].tied).toEqual([0, 1]);
    expect(totalScores(results)).toEqual([14, 1, 0]);
  });

  it('rejects arrangements that are not in descending strength', () => {
    const strong = set('AS AH AD');
    const weak = set('KS 9H 4D');
    const middle = set('QS QH 2D');
    const rest = [set('JS 8H 3D'), set('10S 7H 2C')];
    expect(checkArrangement([strong, middle, weak, ...rest]).valid).toBe(true);
    const wrong = checkArrangement([strong, weak, middle, ...rest]);
    expect(wrong.valid).toBe(false);
    expect(wrong.firstOutOfOrder).toBe(2);
  });
});

function randomTable(seed: number): WinTable {
  const rng = mulberry32(seed);
  const table = new Float32Array(ROUNDS * STRENGTH_COUNT);
  for (let i = 0; i < table.length; i++) table[i] = rng();
  return table;
}

function monotoneTable(seed: number): WinTable {
  const rng = mulberry32(seed);
  const table = new Float32Array(ROUNDS * STRENGTH_COUNT);
  for (let round = 0; round < ROUNDS; round++) {
    let total = 0;
    const steps = Array.from({ length: STRENGTH_COUNT }, () => rng() ** 3);
    const sum = steps.reduce((a, b) => a + b, 0);
    for (let s = 0; s < STRENGTH_COUNT; s++) {
      total += steps[s] / sum;
      table[round * STRENGTH_COUNT + s] = total;
    }
  }
  return table;
}

/** Tries every split of 15 cards into five sets. */
function bruteForce(cards: Card[], value: Float32Array): number {
  let best = -1;
  const strengths: number[] = [];
  const search = (remaining: Card[]) => {
    if (remaining.length === 0) {
      const sorted = [...strengths].sort((a, b) => b - a);
      let total = 0;
      for (let round = 0; round < ROUNDS; round++) total += value[round * STRENGTH_COUNT + sorted[round]];
      if (total > best) best = total;
      return;
    }
    const first = remaining[0];
    for (let i = 1; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        strengths.push(strengthOfSet([first, remaining[i], remaining[j]]));
        search(remaining.filter((_, index) => index !== 0 && index !== i && index !== j));
        strengths.pop();
      }
    }
  };
  search(cards);
  return best;
}

describe('optimiser', () => {
  it('matches an exhaustive search over every split of 15 cards', () => {
    const deal = dealCards(mulberry32(11));
    for (const [index, table] of [randomTable(1), monotoneTable(2)].entries()) {
      const value = makeValueTable(table, undefined, 0);
      const cards = deal.hands[index].slice(0, 15);
      const result = optimise(cards, value);
      expect(result.value).toBeCloseTo(bruteForce(cards, value), 4);
      expect(isDescending(result.strengths)).toBe(true);
      expect(result.sets.map(strengthOfSet)).toEqual(result.strengths);
      expect(result.discards).toEqual([]);
    }
  }, 60_000);

  it('returns sets that are in order and really score the value it reports', () => {
    const rng = mulberry32(77);
    for (let trial = 0; trial < 120; trial++) {
      const deal = dealCards(rng);
      const hand = trial % 2 === 0 ? deal.hands[0] : [...deal.hands[1], deal.centre];
      const value = makeValueTable(trial % 4 < 2 ? randomTable(trial + 1) : monotoneTable(trial + 1), undefined, 0);
      const result = optimise(hand, value);
      const strengths = result.sets.map(strengthOfSet);
      expect(isDescending(strengths)).toBe(true);
      expect(new Set([...result.sets.flat(), ...result.discards])).toEqual(new Set(hand));
      const scored = strengths.reduce((total, s, round) => total + value[round * STRENGTH_COUNT + s], 0);
      expect(scored).toBeCloseTo(result.value, 3);
    }
  }, 60_000);

  it('picks the best discards for 17 and 18 cards', () => {
    const deal = dealCards(mulberry32(5));
    const value = makeValueTable(monotoneTable(9), undefined, 0);
    for (const hand of [deal.hands[0], [...deal.hands[1], deal.centre]]) {
      const result = optimise(hand, value);
      expect(result.discards.length).toBe(hand.length - 15);
      expect(new Set([...result.sets.flat(), ...result.discards])).toEqual(new Set(hand));
      expect(isDescending(result.strengths)).toBe(true);

      let bestOfSubsets = -1;
      const drop = hand.length - 15;
      const choose = (start: number, removed: number[]) => {
        if (removed.length === drop) {
          const kept = hand.filter((_, i) => !removed.includes(i));
          bestOfSubsets = Math.max(bestOfSubsets, optimise(kept, value).value);
          return;
        }
        for (let i = start; i < hand.length; i++) choose(i + 1, [...removed, i]);
      };
      choose(0, []);
      expect(result.value).toBeCloseTo(bestOfSubsets, 4);
    }
  }, 60_000);

  it('breaks a three of a kind when only the late rounds can be won', () => {
    // No sequence can be made, and no rank other than the ace appears more than twice.
    const hand = set('AS AH AD AC 2S 6S 10S QS 4H 8H QH 2D 6D 10D 4C');
    const win = new Float32Array(ROUNDS * STRENGTH_COUNT);
    const pairOfAces = strength('AS AH 2D');
    for (let round = 3; round < ROUNDS; round++) {
      for (let s = pairOfAces; s < STRENGTH_COUNT; s++) win[round * STRENGTH_COUNT + s] = 1;
    }
    const result = optimise(hand, makeValueTable(win, undefined, 0));
    // Keeping three aces together leaves a losing set for round 5 (4 points at most).
    // Two pairs of aces behind three suites win rounds 4 and 5: 9 points.
    expect(expectedPoints(result.strengths, win)).toBe(9);
    expect(result.strengths.map(typeOfStrength)).toEqual(['suite', 'suite', 'suite', 'pair', 'pair']);
  });
});

describe('opponent model', () => {
  it('samples opponents from the unseen cards and respects the known centre card', () => {
    const deal = dealCards(mulberry32(21));
    const seat = rightOf(deal.recipient);
    const view = viewFromTable(deal.hands[seat], { seat, dealer: 0, centre: deal.centre, recipient: deal.recipient });
    expect(view.sizes).toContain(18);
    expect(view.known.flat().sort()).toEqual([deal.centre, twinOf(deal.centre)].sort());

    const samples = sampleOpponents(view, 20, mulberry32(1));
    expect(samples.length).toBe(20 * 10);
    for (let i = 0; i < samples.length; i += ROUNDS) {
      expect(isDescending(Array.from(samples.subarray(i, i + ROUNDS)))).toBe(true);
    }

    const win = buildWinTable(samples, view.roundOneTieWin);
    for (let round = 0; round < ROUNDS; round++) {
      const row = Array.from(win.subarray(round * STRENGTH_COUNT, (round + 1) * STRENGTH_COUNT));
      expect(row[STRENGTH_COUNT - 1]).toBeGreaterThan(0.4);
      expect(row.every((p, i) => i === 0 || p >= row[i - 1] - 1e-6)).toBe(true);
    }
  });

  it('settles round 1 ties by seat and later ties as an even chance', () => {
    const samples = Uint16Array.from([500, 400, 300, 200, 100, 450, 400, 250, 200, 50]);
    const lastToPlay = buildWinTable(samples, [1, 1]);
    const firstToPlayTable = buildWinTable(samples, [0, 0]);
    expect(lastToPlay[500]).toBe(1);
    expect(firstToPlayTable[500]).toBe(0);
    expect(firstToPlayTable[501]).toBe(1);
    expect(lastToPlay[STRENGTH_COUNT + 400]).toBe(0.25);
    expect(lastToPlay[2 * STRENGTH_COUNT + 300]).toBe(0.5);
  });

  it('produces a legal arrangement that beats simply making the strongest sets', () => {
    const deal = dealCards(mulberry32(42));
    const hand = [...deal.hands[deal.recipient], deal.centre];
    const view = viewFromTable(hand, { seat: deal.recipient, dealer: 1, centre: deal.centre, recipient: deal.recipient });
    const solution = solve(view, { samples: 80, rng: mulberry32(8) });
    expect(solution.arrangement.discards.length).toBe(3);
    expect(checkArrangement(solution.arrangement.sets).valid).toBe(true);
    expect(solution.expected).toBeGreaterThan(0);
    expect(solution.expected).toBeLessThanOrEqual(15);

    // Greedy: take the strongest available set five times.
    const remaining = [...hand];
    const greedy: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      let best = { s: -1, cards: [] as Card[] };
      for (let i = 0; i < remaining.length; i++) {
        for (let j = i + 1; j < remaining.length; j++) {
          for (let k = j + 1; k < remaining.length; k++) {
            const cards = [remaining[i], remaining[j], remaining[k]];
            const s = strengthOfSet(cards);
            if (s > best.s) best = { s, cards };
          }
        }
      }
      greedy.push(best.s);
      for (const card of best.cards) remaining.splice(remaining.indexOf(card), 1);
    }
    expect(solution.expected).toBeGreaterThanOrEqual(expectedPoints(greedy, solution.win));
    expect(genericWinTable().length).toBe(ROUNDS * STRENGTH_COUNT);
  });
});
