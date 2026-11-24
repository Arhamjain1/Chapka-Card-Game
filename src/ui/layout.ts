import type { Card } from '../engine/cards.ts';
import { ROUNDS, SET_SIZE, type Seat } from '../engine/rules.ts';
import type { GameState } from '../game/controller.ts';

export interface Point {
  x: number;
  y: number;
}

export interface Geometry {
  width: number;
  height: number;
  navHeight: number;
  cardW: number;
  cardH: number;
  table: { cx: number; cy: number; rx: number; ry: number; rail: number };
  /** Centre of each player's name plate. */
  plates: Record<Seat, Point>;
  /** Centre of each opponent's cards on the felt. */
  oppCards: Record<1 | 2, Point>;
  /** Centre of the set each seat plays onto the table. */
  play: Record<Seat, Point>;
  playScale: number;
  oppScale: number;
  deck: Point;
  discard: Point;
  banner: Point;
  /** The strip at the bottom that holds the human's cards. */
  hand: { y: number; left: number; right: number };
  slots: { centres: number[]; width: number; innerStep: number; y: number };
  side: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function computeGeometry(viewWidth: number, viewHeight: number): Geometry {
  const width = Math.max(viewWidth, 980);
  const height = Math.max(viewHeight, 600);
  const navHeight = 56;
  const cardW = clamp(Math.min(width / 17, height / 9.3), 52, 112);
  const cardH = cardW * 1.4;

  const table = {
    cx: width / 2,
    cy: height * 0.43,
    rx: Math.min(width * 0.37, height * 0.84),
    ry: height * 0.295,
    rail: clamp(height * 0.022, 12, 20),
  };

  const side = clamp(width * 0.16, 200, 236);
  const hand = { y: height - cardH / 2 - 48, left: side + 14, right: width - side - 14 };

  const gap = clamp(width * 0.009, 8, 16);
  const available = hand.right - hand.left;
  const slotWidth = Math.min((available - gap * (ROUNDS - 1)) / ROUNDS, cardW * 2.4 + 16);
  const innerStep = Math.min(cardW * 0.66, (slotWidth - 16 - cardW) / (SET_SIZE - 1));
  const slotsTotal = slotWidth * ROUNDS + gap * (ROUNDS - 1);
  const slotsLeft = (hand.left + hand.right) / 2 - slotsTotal / 2;
  const centres = Array.from({ length: ROUNDS }, (_, i) => slotsLeft + slotWidth / 2 + i * (slotWidth + gap));

  // The opponents sit where the rim passes about 141 degrees (top-left) and 39 degrees (top-right).
  const edgeX = table.rx * 0.777;
  const edgeY = table.ry * 0.629;
  const plateLeft: Point = {
    x: Math.max(118, table.cx - edgeX - 80),
    y: Math.max(navHeight + 58, table.cy - edgeY - 56),
  };
  const cardsLeft: Point = { x: table.cx - edgeX + table.rx * 0.24, y: table.cy - edgeY + table.ry * 0.34 };
  const mirror = (point: Point): Point => ({ x: width - point.x, y: point.y });

  const playLeft: Point = { x: table.cx - table.rx * 0.4, y: table.cy + table.ry * 0.12 };

  return {
    width,
    height,
    navHeight,
    cardW,
    cardH,
    table,
    plates: { 0: { x: side / 2 + 10, y: height - 98 }, 1: plateLeft, 2: mirror(plateLeft) },
    oppCards: { 1: cardsLeft, 2: mirror(cardsLeft) },
    play: { 0: { x: table.cx, y: table.cy + table.ry * 0.54 }, 1: playLeft, 2: mirror(playLeft) },
    playScale: 0.9,
    oppScale: 0.46,
    deck: { x: table.cx, y: table.cy + table.ry * 0.3 },
    discard: { x: table.cx, y: table.cy - table.ry * 0.73 },
    banner: { x: table.cx, y: table.cy - table.ry * 0.36 },
    hand,
    slots: { centres, width: slotWidth, innerStep, y: hand.y },
    side,
  };
}

export type Zone = 'deck' | 'centre' | 'hand' | 'slot' | 'oppHand' | 'oppSets' | 'table' | 'discard';

export interface CardView {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  z: number;
  delay: number;
  faceUp: boolean;
  zone: Zone;
  /** Round index when the card sits in one of the human's sets. */
  slot: number;
  interactive: boolean;
  selected: boolean;
  picked: boolean;
  glow: boolean;
  dim: boolean;
}

const BASE: Omit<CardView, 'x' | 'y' | 'z' | 'zone'> = {
  rotate: 0,
  scale: 1,
  delay: 0,
  faceUp: false,
  slot: -1,
  interactive: false,
  selected: false,
  picked: false,
  glow: false,
  dim: false,
};

/** Where every one of the 52 cards is, and how it looks, for the current state. */
export function computeCardViews(state: GameState, g: Geometry): Map<Card, CardView> {
  const views = new Map<Card, CardView>();
  const { deck, players, phase } = state;

  deck.forEach((card, index) => {
    const depth = deck.length - index;
    views.set(card, {
      ...BASE,
      x: g.deck.x - depth * 0.1,
      y: g.deck.y - depth * 0.24,
      scale: 0.86,
      z: depth,
      zone: 'deck',
    });
  });

  const toDiscard = (card: Card, order: number) => {
    views.set(card, {
      ...BASE,
      x: g.discard.x + (((card * 37) % 13) - 6) * 1.1,
      y: g.discard.y + (((card * 17) % 7) - 3) * 0.9,
      rotate: ((card * 53) % 31) - 15,
      scale: 0.42,
      z: 1 + order,
      zone: 'discard',
    });
  };

  const winner = state.roundStage === 'scored' ? state.results[state.round]?.winner : undefined;

  /** Places a locked set either at home, on the table or in the discard pile. */
  const placeSet = (seat: Seat, round: number, cards: Card[], home: (card: Card, k: number) => CardView) => {
    if (round < state.collected) {
      cards.forEach((card, k) => toDiscard(card, 10 + round * 9 + seat * 3 + k));
      return;
    }
    const onTable = phase === 'play' && round === state.round && state.placed.includes(seat);
    if (!onTable) {
      cards.forEach((card, k) => views.set(card, home(card, k)));
      return;
    }
    const shown = state.roundStage === 'revealed' || state.roundStage === 'scored';
    const step = g.cardW * g.playScale * 0.74;
    cards.forEach((card, k) => {
      views.set(card, {
        ...BASE,
        x: g.play[seat].x + (k - 1) * step,
        y: g.play[seat].y,
        scale: g.playScale,
        z: 300 + seat * 10 + k,
        delay: k * 0.05,
        faceUp: shown,
        zone: 'table',
        glow: winner === seat,
        dim: winner !== undefined && winner !== seat,
      });
    });
  };

  // ---- the human player
  const human = players[0];
  const handCount = human.hand.length;
  if (handCount > 0) {
    const span = g.hand.right - g.hand.left - g.cardW;
    const step = handCount > 1 ? Math.min(g.cardW * 0.66, span / (handCount - 1)) : 0;
    const middle = (handCount - 1) / 2;
    const centreX = (g.hand.left + g.hand.right) / 2;
    human.hand.forEach((card, i) => {
      const selected = state.selected.includes(card);
      const offset = i - middle;
      views.set(card, {
        ...BASE,
        x: centreX + offset * step,
        y: g.hand.y + offset * offset * 0.11 - (selected ? g.cardH * 0.2 : 0),
        rotate: offset * 0.45,
        z: 500 + i,
        delay: state.handRevealed && phase === 'dealing' ? i * 0.02 : 0,
        faceUp: state.handRevealed,
        zone: 'hand',
        interactive: phase === 'discard',
        selected,
      });
    });
  }

  const slotView = (round: number, k: number, card: Card, interactive: boolean): CardView => ({
    ...BASE,
    x: g.slots.centres[round] + (k - 1) * g.slots.innerStep,
    y: g.slots.y - (state.picked === card ? g.cardH * 0.12 : 0),
    z: 500 + round * 3 + k,
    delay: k * 0.02,
    faceUp: true,
    zone: 'slot',
    slot: round,
    interactive,
    picked: state.picked === card,
  });

  if (state.slots) {
    state.slots.forEach((set, round) => set.forEach((card, k) => views.set(card, slotView(round, k, card, phase === 'arrange'))));
  }
  if (human.sets) {
    human.sets.forEach((set, round) => placeSet(0, round, set, (card, k) => slotView(round, k, card, false)));
  }
  human.discards.forEach((card, i) => toDiscard(card, i));

  // ---- the two opponents
  for (const seat of [1, 2] as const) {
    const player = players[seat];
    const origin = g.oppCards[seat];
    const cardW = g.cardW * g.oppScale;
    const count = player.hand.length;
    const middle = (count - 1) / 2;
    player.hand.forEach((card, i) => {
      const offset = i - middle;
      views.set(card, {
        ...BASE,
        x: origin.x + offset * cardW * 0.4,
        y: origin.y + offset * offset * 0.32,
        rotate: offset * 1.7,
        scale: g.oppScale,
        z: 100 + i,
        zone: 'oppHand',
      });
    });

    if (player.sets) {
      const inner = cardW * 0.24;
      const groupWidth = cardW + inner * 2;
      const groupStep = groupWidth + cardW * 0.16;
      player.sets.forEach((set, round) => {
        placeSet(seat, round, set, (_, k) => ({
          ...BASE,
          x: origin.x + (round - 2) * groupStep + (k - 1) * inner,
          y: origin.y,
          scale: g.oppScale,
          z: 100 + round * 3 + k,
          delay: round * 0.04,
          zone: 'oppSets',
        }));
      });
    }
    player.discards.forEach((card, i) => toDiscard(card, 4 + seat * 3 + i));
  }

  // ---- the centre card, before it is picked up
  if (state.centre !== null && state.centreStage === 'shown') {
    views.set(state.centre, {
      ...BASE,
      x: g.table.cx,
      y: g.table.cy + g.table.ry * 0.3,
      scale: 1.15,
      z: 900,
      faceUp: true,
      zone: 'centre',
      glow: true,
    });
  }

  return views;
}
