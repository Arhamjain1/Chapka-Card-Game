/**
 * Command-line Chapka optimiser: type your 17 or 18 cards, get the discards and five sets.
 *
 *   npm run optimise                       asks for your cards, hand after hand
 *   npm run optimise -- AS KH 10D 7C ...   answers for one hand and exits
 *
 * Run with --help for the options.
 */
import { createInterface } from 'node:readline';
import { cardLabel, parseCard, parseCards, sortByRankDesc, type Card } from '../engine/cards.ts';
import { STRENGTH_COUNT, describeSet } from '../engine/evaluate.ts';
import { solveInstant, viewFromDetails, type Solution, type TableDetails } from '../engine/model.ts';
import { expectedPoints, makeValueTable, optimise } from '../engine/optimiser.ts';
import { ROUND_POINTS } from '../engine/rules.ts';
import { randomSeed } from '../engine/rng.ts';
import { SamplePool } from './pool.ts';

const HELP = `Chapka optimiser: finds the discards and five sets with the highest expected points.

Usage:
  npm run optimise                         asks for your cards, hand after hand
  npm run optimise -- <cards> [options]    answers for one hand

Cards: rank then suit, separated by spaces, for example  AS 10H 7D KC
  Ranks: A K Q J 10 (or T) 9 8 7 6 5 4 3 2      Suits: S H D C

Options:
  --fast          skip the simulation and answer from the built-in table only
  --samples N     opponent deals to simulate (default 400)
  --dealer WHO    me | right | left; settles exact ties in round 1
  --picker WHO    right | left; who picked the centre card up, if not you
  --centre CARD   the card that was opened at the centre
  --seed N        fixes the simulation for repeatable output
  --threads N     threads to use (default: one less than the CPU count, at most 8)`;

class InputError extends Error {}

function readHand(text: string): Card[] {
  const { cards, rejected } = parseCards(text);
  if (rejected.length > 0) {
    throw new InputError(`Cannot read ${rejected.map((token) => `"${token}"`).join(', ')}. Use a rank and a suit, for example AS, 10H, 7D or KC.`);
  }
  const repeated = cards.filter((card, i) => cards.indexOf(card) !== i);
  if (repeated.length > 0) throw new InputError(`${[...new Set(repeated)].map(cardLabel).join(', ')} appears more than once.`);
  if (cards.length !== 17 && cards.length !== 18) throw new InputError(`Give 17 or 18 cards. You gave ${cards.length}.`);
  return cards;
}

function readOptions(args: string[]): { cardText: string; options: Record<string, string>; fast: boolean } {
  const options: Record<string, string> = {};
  const cardTexts: string[] = [];
  let fast = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--fast') {
      fast = true;
    } else if (arg.startsWith('--')) {
      const value = args[++i];
      if (value === undefined) throw new InputError(`${arg} needs a value.`);
      options[arg.slice(2)] = value;
    } else {
      cardTexts.push(arg);
    }
  }
  const allowed = ['samples', 'dealer', 'picker', 'centre', 'seed', 'threads'];
  const unknown = Object.keys(options).find((name) => !allowed.includes(name));
  if (unknown) throw new InputError(`Unknown option --${unknown}.`);
  return { cardText: cardTexts.join(' '), options, fast };
}

function wholeNumber(name: string, text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1) throw new InputError(`--${name} must be a whole number of at least 1.`);
  return value;
}

function readDetails(options: Record<string, string>): TableDetails {
  const details: TableDetails = {};
  const dealer = options.dealer?.toLowerCase();
  if (dealer !== undefined) {
    if (dealer !== 'me' && dealer !== 'right' && dealer !== 'left') throw new InputError('--dealer must be me, right or left.');
    details.dealer = dealer;
  }
  const picker = options.picker?.toLowerCase();
  if (picker !== undefined) {
    if (picker !== 'right' && picker !== 'left') throw new InputError('--picker must be right or left.');
    details.picker = picker;
  }
  if (options.centre !== undefined) {
    try {
      details.centre = parseCard(options.centre);
    } catch (error) {
      throw new InputError((error as Error).message);
    }
  }
  return details;
}

function report(hand: Card[], { arrangement, win, expected }: Solution, footer: string): void {
  const show = (cards: readonly Card[]) => cards.map(cardLabel).join(' ');
  console.log('');
  console.log(`Hand (${hand.length} cards): ${show(sortByRankDesc(hand))}`);
  console.log(`Discard: ${show(arrangement.discards)}`);
  console.log('');
  arrangement.sets.forEach((set, round) => {
    const info = describeSet(set);
    const chance = win[round * STRENGTH_COUNT + info.strength];
    const points = `${ROUND_POINTS[round]} pt${ROUND_POINTS[round] > 1 ? 's' : ''}`;
    console.log(
      `Round ${round + 1} (${points.padEnd(5)}) ${show(set).padEnd(12)} ${`${info.label}, ${info.detail}`.padEnd(32)} win ${(chance * 100).toFixed(0).padStart(3)}%`,
    );
  });
  console.log('');
  console.log(`Expected points: ${expected.toFixed(2)} of 15`);
  console.log(footer);
}

async function answer(
  hand: Card[],
  details: TableDetails,
  pool: SamplePool | null,
  samples: number,
  seed: number,
): Promise<void> {
  const started = performance.now();
  if (!pool) {
    const solution = solveInstant(hand);
    report(hand, solution, `(instant answer from the built-in table, ${(performance.now() - started).toFixed(0)} ms)`);
    return;
  }
  const view = viewFromDetails(hand, details);
  const win = await pool.winTable(view, samples, seed);
  const arrangement = optimise(hand, makeValueTable(win));
  const seconds = ((performance.now() - started) / 1000).toFixed(2);
  report(
    hand,
    { arrangement, win, expected: expectedPoints(arrangement.strengths, win) },
    `(${samples} simulated deals against two smart opponents, ${seconds}s, seed ${seed})`,
  );
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(HELP);
    return;
  }

  const { cardText, options, fast } = readOptions(args);
  const samples = wholeNumber('samples', options.samples, 400);
  const fixedSeed = options.seed === undefined ? undefined : wholeNumber('seed', options.seed, 1);
  const details = readDetails(options);
  const threads = options.threads === undefined ? undefined : wholeNumber('threads', options.threads, 1);
  const pool = fast ? null : new SamplePool(threads);

  try {
    if (cardText) {
      await answer(readHand(cardText), details, pool, samples, fixedSeed ?? randomSeed());
      return;
    }

    const interactive = process.stdin.isTTY === true;
    const lines = createInterface({ input: process.stdin, output: process.stdout, terminal: interactive });
    console.log('Chapka optimiser. Type your 17 or 18 cards, for example: AS KH 10D 7C ...');
    if (interactive) console.log('Press Enter on an empty line to quit.');
    lines.setPrompt('\nYour cards: ');
    if (interactive) lines.prompt();
    for await (const raw of lines) {
      const line = raw.trim();
      if (interactive && (line === '' || line === 'q' || line === 'quit' || line === 'exit')) break;
      if (line !== '') {
        try {
          await answer(readHand(line), details, pool, samples, fixedSeed ?? randomSeed());
        } catch (error) {
          if (!(error instanceof Error) || !(error instanceof InputError || /centre card/.test(error.message))) throw error;
          console.log(error.message);
        }
      }
      if (interactive) lines.prompt();
    }
    lines.close();
  } finally {
    await pool?.close();
  }
}

main().catch((error: Error) => {
  console.error(error.message);
  if (error instanceof InputError) console.error('Run with --help for usage.');
  process.exit(1);
});
