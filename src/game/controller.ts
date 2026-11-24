import { SoundEngine } from '../audio/sound.ts';
import { decide, type Personality } from '../engine/ai.ts';
import { sortByRankDesc, sortBySuit, type Card } from '../engine/cards.ts';
import { STRENGTH_COUNT, orderSetForDisplay, strengthOfSet } from '../engine/evaluate.ts';
import { genericWinTable, viewFromTable, type PlayerView } from '../engine/model.ts';
import { expectedPoints, makeValueTable, optimise, type ValueTable, type WinTable } from '../engine/optimiser.ts';
import { mulberry32, randomSeed } from '../engine/rng.ts';
import {
  ROUNDS,
  SEATS,
  SET_SIZE,
  checkArrangement,
  dealCards,
  discardCount,
  firstToPlay,
  playOrder,
  resolveRound,
  rightOf,
  type RoundResult,
  type Seat,
} from '../engine/rules.ts';
import { OptimiserClient, type AiResult } from '../worker/client.ts';
import { SPEED_FACTOR, loadSettings, saveSettings, type Settings } from './settings.ts';

export type Phase = 'lobby' | 'dealer' | 'dealing' | 'centre' | 'discard' | 'arrange' | 'locked' | 'play' | 'results';
export type PlayerKind = 'human' | Personality;
export type PlayerStatus = 'idle' | 'thinking' | 'ready' | 'playing';
export type RoundStage = 'idle' | 'intro' | 'placing' | 'placed' | 'revealed' | 'scored';

export interface PlayerState {
  seat: Seat;
  kind: PlayerKind;
  name: string;
  title: string;
  status: PlayerStatus;
  /** Cards held that are not yet locked into sets, in display order. */
  hand: Card[];
  discards: Card[];
  /** The locked arrangement, round 1 first. */
  sets: Card[][] | null;
  /** Points won in each round; 0 when the round was lost or not yet played. */
  roundPoints: number[];
}

export interface GameState {
  phase: Phase;
  settings: Settings;
  gameNumber: number;
  session: { games: number; wins: [number, number, number] };

  /** Where the dealer badge currently sits; it hops between seats while the dealer is chosen. */
  dealer: Seat | null;
  dealerSettled: boolean;

  /** All 52 cards in dealing order; the last one is the centre card. */
  deck: Card[];
  dealt: number;
  handRevealed: boolean;
  centre: Card | null;
  centreStage: 'hidden' | 'shown' | 'taken';
  recipient: Seat | null;

  players: [PlayerState, PlayerState, PlayerState];

  /** Cards the human has marked for discarding. */
  selected: Card[];
  /** The human's working arrangement while arranging. */
  slots: Card[][] | null;
  slotsInitial: Card[][] | null;
  /** A card tapped in the arrangement, waiting for a second tap to swap with. */
  picked: Card | null;
  /** True once the optimiser has estimated the human's win chances. */
  optimiserReady: boolean;
  optimiserBusy: boolean;

  round: number;
  roundStage: RoundStage;
  order: Seat[];
  placed: Seat[];
  results: RoundResult[];
  /** Rounds whose cards have been cleared from the table. */
  collected: number;
  awaitingAdvance: boolean;
}

export const OPPONENTS: Record<1 | 2, { kind: Personality; name: string; title: string; blurb: string }> = {
  1: {
    kind: 'strategist',
    name: 'Kabir',
    title: 'The Strategist',
    blurb: 'Calm and exact. Plays the numbers and saves his strength for the rounds that pay.',
  },
  2: {
    kind: 'maverick',
    name: 'Zoya',
    title: 'The Maverick',
    blurb: 'Aggressive and hard to read. Some nights she storms the early rounds, some nights she bets it all on the last.',
  },
};

const CANCELLED = Symbol('cancelled');
type Step = (ms: number) => Promise<void>;

function freshPlayers(settings: Settings): [PlayerState, PlayerState, PlayerState] {
  const base = { status: 'idle' as PlayerStatus, hand: [], discards: [], sets: null };
  const points = () => Array.from({ length: ROUNDS }, () => 0);
  return [
    { ...base, seat: 0, kind: 'human', name: settings.name, title: 'Your seat', roundPoints: points() },
    { ...base, seat: 1, kind: OPPONENTS[1].kind, name: OPPONENTS[1].name, title: OPPONENTS[1].title, roundPoints: points() },
    { ...base, seat: 2, kind: OPPONENTS[2].kind, name: OPPONENTS[2].name, title: OPPONENTS[2].title, roundPoints: points() },
  ];
}

function lobbyState(settings: Settings): GameState {
  return {
    phase: 'lobby',
    settings,
    gameNumber: 0,
    session: { games: 0, wins: [0, 0, 0] },
    dealer: null,
    dealerSettled: false,
    deck: [],
    dealt: 0,
    handRevealed: false,
    centre: null,
    centreStage: 'hidden',
    recipient: null,
    players: freshPlayers(settings),
    selected: [],
    slots: null,
    slotsInitial: null,
    picked: null,
    optimiserReady: false,
    optimiserBusy: false,
    round: -1,
    roundStage: 'idle',
    order: [],
    placed: [],
    results: [],
    collected: 0,
    awaitingAdvance: false,
  };
}

export const scoreOf = (player: PlayerState): number => player.roundPoints.reduce((a, b) => a + b, 0);

/** Owns the game state and runs the timeline of a game; the UI only renders and calls actions. */
export class GameController {
  readonly sound = new SoundEngine();
  private state: GameState;
  private readonly listeners = new Set<() => void>();
  private epoch = 0;
  private readonly optimiser = new OptimiserClient();
  private humanWin: WinTable | null = null;
  private humanValue: ValueTable | null = null;
  private humanTable: Promise<void> = Promise.resolve();
  private aiReady: Promise<void>[] = [];
  private advanceResolver: (() => void) | null = null;

  constructor() {
    const settings = loadSettings();
    this.sound.enabled = settings.sound;
    this.state = lobbyState(settings);
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getState = (): GameState => this.state;

  private patch(partial: Partial<GameState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) listener();
  }

  private patchPlayer(seat: Seat, partial: Partial<PlayerState>): void {
    const players = [...this.state.players] as GameState['players'];
    players[seat] = { ...players[seat], ...partial };
    this.patch({ players });
  }

  private run(flow: (step: Step) => Promise<void>): void {
    const epoch = this.epoch;
    const step: Step = async (ms) => {
      await new Promise((resolve) => setTimeout(resolve, ms * SPEED_FACTOR[this.state.settings.speed]));
      if (epoch !== this.epoch) throw CANCELLED;
    };
    flow(step).catch((error) => {
      if (error !== CANCELLED) console.error(error);
    });
  }

  // ---------------------------------------------------------------- settings

  updateSettings(partial: Partial<Settings>): void {
    const settings = { ...this.state.settings, ...partial };
    settings.name = settings.name.slice(0, 14);
    saveSettings({ ...settings, name: settings.name.trim() || 'You' });
    this.sound.enabled = settings.sound;
    const players = [...this.state.players] as GameState['players'];
    players[0] = { ...players[0], name: settings.name.trim() || 'You' };
    this.patch({ settings, players });
  }

  // ---------------------------------------------------------------- game flow

  startGame(mode: 'new' | 'again'): void {
    this.sound.unlock();
    this.epoch++;
    this.optimiser.reset();
    this.humanWin = null;
    this.humanValue = null;
    this.aiReady = [];
    this.advanceResolver = null;

    const previous = this.state;
    const continuing = mode === 'again' && previous.dealer !== null;
    const dealer: Seat = continuing ? rightOf(previous.dealer!) : SEATS[Math.floor(Math.random() * 3)];

    const deal = dealCards(mulberry32(randomSeed()));
    const dealOrder = playOrder(rightOf(dealer));
    const sequence: { card: Card; seat: Seat }[] = [];
    for (let i = 0; i < deal.hands[0].length; i++) {
      for (const seat of dealOrder) sequence.push({ card: deal.hands[seat][i], seat });
    }

    this.patch({
      ...lobbyState(previous.settings),
      phase: 'dealer',
      gameNumber: previous.gameNumber + 1,
      session: continuing ? previous.session : { games: 0, wins: [0, 0, 0] },
      dealer: continuing ? previous.dealer : null,
      deck: [...sequence.map((entry) => entry.card), deal.centre],
      centre: deal.centre,
      recipient: deal.recipient,
    });

    this.run(async (step) => {
      await step(500);
      if (continuing) {
        this.patch({ dealer });
        this.sound.tick();
      } else {
        // The badge travels anticlockwise and slows down until it lands on the dealer.
        const hops = 9 + Math.floor(Math.random() * 3);
        let seat = dealer;
        for (let i = 0; i < hops; i++) seat = rightOf(rightOf(seat));
        for (let i = 0; i <= hops; i++) {
          this.patch({ dealer: seat });
          this.sound.tick();
          if (i < hops) {
            seat = rightOf(seat);
            await step(110 + i * 34);
          }
        }
      }
      await step(350);
      this.patch({ dealerSettled: true });
      await step(1500);

      this.patch({ phase: 'dealing' });
      this.sound.shuffle();
      await step(1100);
      for (let i = 0; i < sequence.length; i++) {
        const { card, seat } = sequence[i];
        const players = [...this.state.players] as GameState['players'];
        players[seat] = { ...players[seat], hand: [...players[seat].hand, card] };
        this.patch({ players, dealt: i + 1 });
        this.sound.deal();
        await step(36);
      }
      await step(450);
      this.patchPlayer(0, { hand: sortByRankDesc(this.state.players[0].hand) });
      this.patch({ handRevealed: true });
      this.sound.flip();
      await step(1000);

      this.patch({ phase: 'centre', centreStage: 'shown' });
      this.sound.flip();
      await step(2600);
      const recipient = deal.recipient;
      const held = [...this.state.players[recipient].hand, deal.centre];
      this.patchPlayer(recipient, { hand: recipient === 0 ? sortByRankDesc(held) : held });
      this.patch({ centreStage: 'taken', dealt: 52 });
      this.sound.place();
      await step(1300);

      this.patch({
        phase: 'discard',
        players: this.state.players.map((player) => ({ ...player, status: 'thinking' })) as GameState['players'],
      });
      this.startThinking(dealer);
    });
  }

  private viewFor(seat: Seat, dealer: Seat): PlayerView {
    const { centre, recipient, players } = this.state;
    return viewFromTable(players[seat].hand, { seat, dealer, centre: centre!, recipient: recipient! });
  }

  private startThinking(dealer: Seat): void {
    const epoch = this.epoch;
    const speed = SPEED_FACTOR[this.state.settings.speed];

    this.humanTable = this.optimiser
      .winTable(this.viewFor(0, dealer))
      .catch((error: Error) => {
        if (error.message !== 'cancelled') console.error(error);
        return genericWinTable();
      })
      .then((win) => {
        if (epoch !== this.epoch) return;
        this.humanWin = win;
        this.humanValue = makeValueTable(win);
        this.patch({ optimiserReady: true });
      });

    this.aiReady = ([1, 2] as const).map(async (seat) => {
      const personality = OPPONENTS[seat].kind;
      const view = this.viewFor(seat, dealer);
      const started = performance.now();
      const minimum = ((seat === 1 ? 11000 : 7000) + Math.random() * 6000) * speed;
      let result: AiResult;
      try {
        result = await this.optimiser.decide(personality, view);
      } catch (error) {
        if (epoch !== this.epoch) return;
        console.error(error);
        const fallback = decide(personality, view, mulberry32(randomSeed()), 60);
        result = { sets: fallback.arrangement.sets, discards: fallback.arrangement.discards, expected: fallback.expected };
      }
      const remaining = minimum - (performance.now() - started);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
      if (epoch !== this.epoch) return;
      this.patchPlayer(seat, { discards: result.discards, sets: result.sets, hand: [], status: 'ready' });
      this.sound.discard();
    });
  }

  private startPlay(): void {
    this.run(async (step) => {
      await Promise.all(this.aiReady);
      await step(900);
      const dealer = this.state.dealer!;
      this.patch({
        phase: 'play',
        players: this.state.players.map((player) => ({ ...player, status: 'playing' })) as GameState['players'],
      });

      let previousWinner: Seat | null = null;
      for (let round = 0; round < ROUNDS; round++) {
        const order = playOrder(firstToPlay(dealer, previousWinner));
        this.patch({ round, roundStage: 'intro', order, placed: [] });
        this.sound.tick();
        await step(1500);

        this.patch({ roundStage: 'placing' });
        for (const seat of order) {
          this.patch({ placed: [...this.state.placed, seat] });
          this.sound.place();
          await step(420);
        }
        this.patch({ roundStage: 'placed' });
        await step(750);

        this.patch({ roundStage: 'revealed' });
        this.sound.flip();
        await step(1250);

        const strengths = SEATS.map((seat) => strengthOfSet(this.state.players[seat].sets![round]));
        const result = resolveRound(round, strengths, dealer, previousWinner);
        const roundPoints = [...this.state.players[result.winner].roundPoints];
        roundPoints[round] = result.points;
        this.patchPlayer(result.winner, { roundPoints });
        this.patch({ results: [...this.state.results, result], roundStage: 'scored' });
        if (result.winner === 0) this.sound.win();
        else this.sound.lose();
        await step(900);

        await this.waitForAdvance(step);
        this.patch({ collected: round + 1, roundStage: 'idle' });
        this.sound.discard();
        await step(650);
        previousWinner = result.winner;
      }

      const scores = this.state.players.map(scoreOf);
      const top = Math.max(...scores);
      const wins = [...this.state.session.wins] as [number, number, number];
      scores.forEach((score, seat) => {
        if (score === top) wins[seat]++;
      });
      this.patch({ phase: 'results', session: { games: this.state.session.games + 1, wins } });
      if (scores[0] === top) this.sound.fanfare();
      else this.sound.finish();
    });
  }

  private async waitForAdvance(step: Step): Promise<void> {
    this.patch({ awaitingAdvance: true });
    if (this.state.settings.autoAdvance) {
      await step(2600);
    } else {
      await new Promise<void>((resolve) => {
        this.advanceResolver = resolve;
      });
      await step(0);
    }
    this.advanceResolver = null;
    this.patch({ awaitingAdvance: false });
  }

  /** Continues after a round has been scored. */
  advance(): void {
    if (!this.state.awaitingAdvance) return;
    this.sound.click();
    this.advanceResolver?.();
  }

  exit(): void {
    this.epoch++;
    this.optimiser.reset();
    this.advanceResolver = null;
    this.patch(lobbyState(this.state.settings));
  }

  // ---------------------------------------------------------------- discarding

  get discardsNeeded(): number {
    return discardCount(this.state.players[0].hand.length);
  }

  toggleSelect(card: Card): void {
    const { phase, selected } = this.state;
    if (phase !== 'discard') return;
    if (selected.includes(card)) {
      this.sound.deselect();
      this.patch({ selected: selected.filter((other) => other !== card) });
    } else if (selected.length < this.discardsNeeded) {
      this.sound.select();
      this.patch({ selected: [...selected, card] });
    } else {
      this.sound.warn();
    }
  }

  /** Moves a card to a new position in the human's hand. */
  moveInHand(card: Card, toIndex: number): void {
    const hand = this.state.players[0].hand.filter((other) => other !== card);
    hand.splice(Math.max(0, Math.min(hand.length, toIndex)), 0, card);
    this.patchPlayer(0, { hand });
  }

  sortHand(mode: 'rank' | 'suit'): void {
    const hand = this.state.players[0].hand;
    this.sound.click();
    this.patchPlayer(0, { hand: mode === 'rank' ? sortByRankDesc(hand) : sortBySuit(hand) });
  }

  /** Marks the discards the optimiser would make from the full hand. */
  async suggestDiscards(): Promise<void> {
    if (this.state.phase !== 'discard' || this.state.optimiserBusy) return;
    const epoch = this.epoch;
    this.sound.click();
    this.patch({ optimiserBusy: true });
    await this.humanTable;
    if (epoch !== this.epoch) return;
    this.patch({ optimiserBusy: false });
    if (this.state.phase !== 'discard') return;
    const { discards } = optimise(this.state.players[0].hand, this.humanValue!);
    this.sound.select();
    this.patch({ selected: discards });
  }

  /** One step: the optimiser chooses the discards and arranges the other 15 cards into five sets. */
  async optimiseHand(): Promise<void> {
    if (this.state.phase !== 'discard' || this.state.optimiserBusy) return;
    const epoch = this.epoch;
    this.sound.click();
    this.patch({ optimiserBusy: true });
    await Promise.all([this.humanTable, new Promise((resolve) => setTimeout(resolve, 350))]);
    if (epoch !== this.epoch) return;
    this.patch({ optimiserBusy: false });
    if (this.state.phase !== 'discard') return;
    const hand = this.state.players[0].hand;
    const { sets, discards } = optimise(hand, this.humanValue!);
    const kept = sortByRankDesc(hand.filter((card) => !discards.includes(card)));
    const initial: Card[][] = [];
    for (let i = 0; i < ROUNDS; i++) initial.push(kept.slice(i * SET_SIZE, (i + 1) * SET_SIZE));
    this.sound.discard();
    this.patchPlayer(0, { hand: [], discards });
    this.patch({ phase: 'arrange', selected: [], slots: sets, slotsInitial: initial, picked: null });
  }

  confirmDiscards(): void {
    const { phase, selected, players } = this.state;
    if (phase !== 'discard' || selected.length !== this.discardsNeeded) return;
    const hand = players[0].hand.filter((card) => !selected.includes(card));
    const slots: Card[][] = [];
    for (let i = 0; i < ROUNDS; i++) slots.push(hand.slice(i * SET_SIZE, (i + 1) * SET_SIZE));
    this.sound.discard();
    this.patchPlayer(0, { hand: [], discards: selected });
    this.patch({ phase: 'arrange', selected: [], slots, slotsInitial: slots, picked: null });
  }

  /** Returns from arranging to choosing discards. */
  changeDiscards(): void {
    const { phase, slots, players } = this.state;
    if (phase !== 'arrange' || !slots) return;
    const discards = players[0].discards;
    this.sound.click();
    this.patchPlayer(0, { hand: sortByRankDesc([...slots.flat(), ...discards]), discards: [] });
    this.patch({ phase: 'discard', selected: discards, slots: null, slotsInitial: null, picked: null });
  }

  // ---------------------------------------------------------------- arranging

  swapCards(a: Card, b: Card): void {
    const { phase, slots } = this.state;
    if (phase !== 'arrange' || !slots || a === b) return;
    this.sound.place();
    this.patch({
      slots: slots.map((set) => set.map((card) => (card === a ? b : card === b ? a : card))),
      picked: null,
    });
  }

  /** Tap-to-swap: the first tap picks a card up, the second swaps it with another. */
  pick(card: Card): void {
    const { phase, picked } = this.state;
    if (phase !== 'arrange') return;
    if (picked === null) {
      this.sound.select();
      this.patch({ picked: card });
    } else if (picked === card) {
      this.sound.deselect();
      this.patch({ picked: null });
    } else {
      this.swapCards(picked, card);
    }
  }

  async autoArrange(): Promise<void> {
    if (this.state.phase !== 'arrange' || this.state.optimiserBusy) return;
    const epoch = this.epoch;
    this.sound.click();
    this.patch({ optimiserBusy: true });
    await Promise.all([this.humanTable, new Promise((resolve) => setTimeout(resolve, 450))]);
    if (epoch !== this.epoch) return;
    this.patch({ optimiserBusy: false });
    if (this.state.phase !== 'arrange' || !this.state.slots) return;
    const { sets } = optimise(this.state.slots.flat(), this.humanValue!);
    this.sound.place();
    this.patch({ slots: sets, picked: null });
  }

  resetArrangement(): void {
    if (this.state.phase !== 'arrange') return;
    this.sound.click();
    this.patch({ slots: this.state.slotsInitial, picked: null });
  }

  /** Reorders the five sets from strongest to weakest without changing their cards. */
  sortSets(): void {
    const { phase, slots } = this.state;
    if (phase !== 'arrange' || !slots) return;
    this.sound.place();
    const sorted = slots
      .map((set, index) => ({ set, index, strength: strengthOfSet(set) }))
      .sort((a, b) => b.strength - a.strength || a.index - b.index)
      .map((entry) => entry.set);
    this.patch({ slots: sorted, picked: null });
  }

  lockSets(): void {
    const { phase, slots } = this.state;
    if (phase !== 'arrange' || !slots) return;
    if (!checkArrangement(slots).valid) {
      this.sound.warn();
      return;
    }
    this.sound.place();
    this.patchPlayer(0, { sets: slots.map(orderSetForDisplay), status: 'ready' });
    this.patch({ phase: 'locked', slots: null, picked: null });
    this.startPlay();
  }

  // ---------------------------------------------------------------- optimiser read-outs

  /** The human's chance of winning `round` with a set of `strength`, once the optimiser is ready. */
  winChance(round: number, strength: number): number | null {
    return this.humanWin ? this.humanWin[round * STRENGTH_COUNT + strength] : null;
  }

  expected(strengths: readonly number[]): number | null {
    return this.humanWin && strengths.length === ROUNDS ? expectedPoints(strengths, this.humanWin) : null;
  }
}
