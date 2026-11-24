import { memo, useCallback, useMemo, useRef, useState, type PointerEvent } from 'react';
import { animate, motion, useMotionValue } from 'framer-motion';
import { cardName, type Card } from '../engine/cards.ts';
import type { GameState } from '../game/controller.ts';
import { game } from '../game/useGame.ts';
import { computeCardViews, type CardView, type Geometry } from './layout.ts';
import { PlayingCard } from './PlayingCard.tsx';

interface SpriteProps {
  card: Card;
  view: CardView;
  cardW: number;
  cardH: number;
  dragging: boolean;
  targeted: boolean;
  onActivate: (card: Card) => void;
  onDragStart: (card: Card) => void;
  onDragMove: (card: Card, clientX: number, clientY: number) => void;
  onDragEnd: (card: Card, clientX: number, clientY: number) => void;
}

/** How far the pointer must travel before a press becomes a drag rather than a click. */
const DRAG_THRESHOLD = 6;
const SETTLE = { type: 'spring', stiffness: 320, damping: 30 } as const;

const CardSprite = memo(function CardSprite({
  card,
  view,
  cardW,
  cardH,
  dragging,
  targeted,
  onActivate,
  onDragStart,
  onDragMove,
  onDragEnd,
}: SpriteProps) {
  const { interactive } = view;
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);
  const press = useRef<{ pointer: number; x: number; y: number; moved: boolean } | null>(null);

  const release = (event: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const current = press.current;
    if (!current || current.pointer !== event.pointerId) return;
    press.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (current.moved) {
      onDragEnd(card, cancelled ? Number.NaN : event.clientX, event.clientY);
      void animate(offsetX, 0, SETTLE);
      void animate(offsetY, 0, SETTLE);
    } else if (!cancelled) {
      onActivate(card);
    }
  };

  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ width: cardW, height: cardH, zIndex: dragging ? 3000 : view.z, pointerEvents: interactive ? 'auto' : 'none' }}
      initial={false}
      animate={{ x: view.x - cardW / 2, y: view.y - cardH / 2, rotate: view.rotate, scale: view.scale }}
      transition={{ type: 'spring', stiffness: 190, damping: 25, mass: 0.9, delay: view.delay }}
    >
      <motion.div
        className="h-full w-full"
        style={{ x: offsetX, y: offsetY, cursor: interactive ? (dragging ? 'grabbing' : 'pointer') : 'default', touchAction: 'none' }}
        animate={{ scale: dragging ? 1.08 : 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        role={interactive ? 'button' : undefined}
        tabIndex={interactive ? 0 : undefined}
        aria-label={view.faceUp ? cardName(card) : undefined}
        aria-pressed={interactive ? view.selected || view.picked : undefined}
        onPointerDown={(event) => {
          if (!interactive || event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          press.current = { pointer: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
        }}
        onPointerMove={(event) => {
          const current = press.current;
          if (!current || current.pointer !== event.pointerId) return;
          const dx = event.clientX - current.x;
          const dy = event.clientY - current.y;
          if (!current.moved) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
            current.moved = true;
            onDragStart(card);
          }
          offsetX.set(dx);
          offsetY.set(dy);
          onDragMove(card, event.clientX, event.clientY);
        }}
        onPointerUp={(event) => release(event, false)}
        onPointerCancel={(event) => release(event, true)}
        onKeyDown={(event) => {
          if (interactive && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onActivate(card);
          }
        }}
      >
        <motion.div
          className="h-full w-full"
          whileHover={interactive && !dragging ? { y: -cardH * 0.07, scale: 1.05 } : undefined}
          transition={{ type: 'spring', stiffness: 380, damping: 26 }}
        >
          <PlayingCard
            card={card}
            faceUp={view.faceUp}
            glow={view.glow}
            dim={view.dim}
            outline={view.selected || view.picked || targeted}
            flipDelay={view.zone === 'hand' ? view.delay : 0}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
});

/** Renders all 52 cards on one layer so they can travel freely between hand, table and discard pile. */
export function CardLayer({ state, geometry }: { state: GameState; geometry: Geometry }) {
  const views = useMemo(() => computeCardViews(state, geometry), [state, geometry]);
  const viewsRef = useRef(views);
  viewsRef.current = views;
  const stateRef = useRef(state);
  stateRef.current = state;

  const [dragging, setDragging] = useState<Card | null>(null);
  const [target, setTarget] = useState<Card | null>(null);
  const layer = useRef<HTMLDivElement>(null);

  /** Converts a pointer position into the coordinates the card views use. */
  const toLayer = useCallback((clientX: number, clientY: number) => {
    const rect = layer.current?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  }, []);

  /** The card in a set under the pointer, if any, other than the one being dragged. */
  const slotCardAt = useCallback(
    (dragged: Card, x: number, y: number): Card | null => {
      let best: Card | null = null;
      let bestDistance = Infinity;
      for (const [card, view] of viewsRef.current) {
        if (view.zone !== 'slot' || card === dragged) continue;
        const dx = x - view.x;
        const dy = y - view.y;
        if (Math.abs(dx) > geometry.cardW * 0.8 || Math.abs(dy) > geometry.cardH * 0.85) continue;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          best = card;
          bestDistance = distance;
        }
      }
      return best;
    },
    [geometry],
  );

  const onActivate = useCallback((card: Card) => {
    const phase = stateRef.current.phase;
    if (phase === 'discard') game.toggleSelect(card);
    else if (phase === 'arrange') game.pick(card);
  }, []);

  const onDragStart = useCallback((card: Card) => setDragging(card), []);

  const onDragMove = useCallback(
    (card: Card, clientX: number, clientY: number) => {
      if (stateRef.current.phase !== 'arrange') return;
      const point = toLayer(clientX, clientY);
      const next = slotCardAt(card, point.x, point.y);
      setTarget((current) => (current === next ? current : next));
    },
    [slotCardAt, toLayer],
  );

  const onDragEnd = useCallback(
    (card: Card, clientX: number, clientY: number) => {
      setDragging(null);
      setTarget(null);
      if (Number.isNaN(clientX)) return;
      const point = toLayer(clientX, clientY);
      const current = stateRef.current;
      if (current.phase === 'arrange') {
        const other = slotCardAt(card, point.x, point.y);
        if (other !== null) game.swapCards(card, other);
      } else if (current.phase === 'discard') {
        const hand = current.players[0].hand;
        let index = 0;
        for (const other of hand) {
          if (other === card) continue;
          const view = viewsRef.current.get(other);
          if (view && view.x < point.x) index++;
        }
        if (hand.indexOf(card) !== index) game.moveInHand(card, index);
      }
    },
    [slotCardAt, toLayer],
  );

  return (
    <div ref={layer} className="pointer-events-none absolute inset-0 z-20">
      {state.deck.map((card) => {
        const view = views.get(card)!;
        return (
          <CardSprite
            key={card}
            card={card}
            view={view}
            cardW={geometry.cardW}
            cardH={geometry.cardH}
            dragging={dragging === card}
            targeted={target === card}
            onActivate={onActivate}
            onDragStart={onDragStart}
            onDragMove={onDragMove}
            onDragEnd={onDragEnd}
          />
        );
      })}
    </div>
  );
}
