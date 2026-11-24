/**
 * Measures how many points different ways of arranging a hand earn in real play.
 *
 * Seat 0 arranges the same deal three ways while both opponents play the smart
 * arrangement from the self-play table. With three equal players the average is 5 points.
 *
 * Usage: node src/cli/evaluate.ts [--deals 100] [--samples 240] [--seed 1]
 */
import type { Card } from '../engine/cards.ts';
import { strengthOfSet } from '../engine/evaluate.ts';
import { genericValueTable, solve, viewFromTable } from '../engine/model.ts';
import { optimise } from '../engine/optimiser.ts';
import { ROUNDS, SEATS, dealCards, playAllRounds, totalScores, type Seat } from '../engine/rules.ts';
import { mulberry32 } from '../engine/rng.ts';

function argument(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? Number(process.argv[index + 1]) : fallback;
}

/** Takes the strongest available set five times, with no thought for the late rounds. */
function strongestFirst(hand: readonly Card[]): number[] {
  const remaining = [...hand];
  const strengths: number[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    let best = -1;
    let cards: Card[] = [];
    for (let i = 0; i < remaining.length; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        for (let k = j + 1; k < remaining.length; k++) {
          const strength = strengthOfSet([remaining[i], remaining[j], remaining[k]]);
          if (strength > best) {
            best = strength;
            cards = [remaining[i], remaining[j], remaining[k]];
          }
        }
      }
    }
    strengths.push(best);
    for (const card of cards) remaining.splice(remaining.indexOf(card), 1);
  }
  return strengths;
}

const deals = argument('deals', 100);
const samples = argument('samples', 240);
const rng = mulberry32(argument('seed', 1));
const generic = genericValueTable();

const names = ['strongest sets first', 'instant optimiser', `full optimiser (${samples} deals)`];
const totals = [0, 0, 0];
const squares = [0, 0, 0];
/** Per-deal gain of the full optimiser over the instant one. */
let gain = 0;
let gainSquares = 0;

for (let deal = 0; deal < deals; deal++) {
  const { hands, centre, recipient } = dealCards(rng);
  hands[recipient].push(centre);
  const dealer = SEATS[Math.floor(rng() * 3)] as Seat;
  const opponents = [1, 2].map((seat) => optimise(hands[seat], generic).strengths);

  const view = viewFromTable(hands[0], { seat: 0, dealer, centre, recipient });
  const candidates = [
    strongestFirst(hands[0]),
    optimise(hands[0], generic).strengths,
    solve(view, { samples, rng }).arrangement.strengths,
  ];
  const scores = candidates.map((mine) => totalScores(playAllRounds([mine, opponents[0], opponents[1]], dealer))[0]);
  scores.forEach((score, i) => {
    totals[i] += score;
    squares[i] += score * score;
  });
  gain += scores[2] - scores[1];
  gainSquares += (scores[2] - scores[1]) ** 2;
}

const error = (sum: number, sumSquares: number) => Math.sqrt(Math.max(0, sumSquares / deals - (sum / deals) ** 2) / deals);
console.log(JSON.stringify({ deals, totals, squares, gain, gainSquares }));
names.forEach((name, i) => {
  console.log(`${name.padEnd(30)} ${(totals[i] / deals).toFixed(2)} points per game (±${error(totals[i], squares[i]).toFixed(2)})`);
});
console.log(`full minus instant: ${(gain / deals).toFixed(3)} (±${error(gain, gainSquares).toFixed(3)})`);
