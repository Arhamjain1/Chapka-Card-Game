import type { Card } from './cards.ts';
import { DEFAULT_SAMPLES, estimateWinTable, type PlayerView } from './model.ts';
import { expectedPoints, makeValueTable, optimise, type Arrangement, type WinTable } from './optimiser.ts';
import { ROUND_POINTS } from './rules.ts';
import type { Rng } from './rng.ts';

export type Personality = 'strategist' | 'maverick';

export interface AiDecision {
  arrangement: Arrangement;
  /** Expected points of the arrangement under the true scoring, out of 15. */
  expected: number;
}

/** How many simulated deals each personality bases its estimate on. */
export function samplesFor(personality: Personality, samples = DEFAULT_SAMPLES): number {
  return personality === 'strategist' ? samples : Math.max(40, Math.round(samples / 2));
}

/**
 * Both computer players run the same optimiser as the human player's Auto arrange.
 *
 * The strategist maximises expected points under the true 1-5 scoring. The maverick
 * re-weights the rounds differently every game: sometimes it over-commits to round 5,
 * sometimes it fights for the early rounds, so its arrangements are harder to read.
 */
export function arrange(personality: Personality, hand: readonly Card[], win: WinTable, rng: Rng): AiDecision {
  let weights: readonly number[] = ROUND_POINTS;
  if (personality === 'maverick') {
    const exponent = 0.35 + rng() * 1.6;
    weights = ROUND_POINTS.map((points) => Math.pow(points, exponent));
  }
  const arrangement = optimise(hand, makeValueTable(win, weights));
  return { arrangement, expected: expectedPoints(arrangement.strengths, win) };
}

export function decide(personality: Personality, view: PlayerView, rng: Rng, samples = DEFAULT_SAMPLES): AiDecision {
  const win = estimateWinTable(view, samplesFor(personality, samples), rng);
  return arrange(personality, view.hand, win, rng);
}
