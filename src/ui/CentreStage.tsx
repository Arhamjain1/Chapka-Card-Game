import { AnimatePresence, motion } from 'framer-motion';
import { cardName, twinOf } from '../engine/cards.ts';
import { describeSet } from '../engine/evaluate.ts';
import { ROUNDS, SEATS, discardCount, rightOf } from '../engine/rules.ts';
import type { GameState } from '../game/controller.ts';
import type { Geometry } from './layout.ts';

interface Banner {
  id: string;
  eyebrow: string;
  title: string;
  note?: string;
  accent?: boolean;
  /** Shows the note as a gold caption rather than as running text. */
  caption?: boolean;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

function bannerFor(state: GameState): Banner | null {
  const name = (seat: number) => (seat === 0 ? 'You' : state.players[seat].name);
  const verb = (seat: number, you: string, other: string) => (seat === 0 ? you : other);

  switch (state.phase) {
    case 'dealer': {
      if (!state.dealerSettled || state.dealer === null) {
        return { id: 'dealer-pick', eyebrow: 'New game', title: 'Choosing the dealer' };
      }
      const first = rightOf(state.dealer);
      return {
        id: 'dealer-set',
        eyebrow: 'Dealer',
        title: `${name(state.dealer)} ${verb(state.dealer, 'deal', 'deals')}`,
        note: `${name(first)} ${verb(first, 'play', 'plays')} first in round 1`,
      };
    }
    case 'dealing':
      return { id: 'dealing', eyebrow: 'Dealing', title: '17 cards each', note: 'The last card opens at the centre' };
    case 'centre': {
      const { centre, recipient } = state;
      if (centre === null || recipient === null) return null;
      const taken = state.centreStage === 'taken';
      return {
        id: taken ? 'centre-taken' : 'centre',
        eyebrow: 'Centre card',
        title: cardName(centre),
        note: taken
          ? `${name(recipient)} ${verb(recipient, 'hold', 'holds')} 18 cards and must discard 3`
          : `${name(recipient)} ${verb(recipient, 'hold', 'holds')} its twin, the ${cardName(twinOf(centre))}`,
        accent: true,
      };
    }
    case 'discard': {
      const count = discardCount(state.players[0].hand.length);
      return {
        id: 'discard',
        eyebrow: 'Your move',
        title: `Discard ${plural(count, 'card')}`,
        note: 'Keep the 15 that make your best five sets',
      };
    }
    case 'arrange':
      return {
        id: 'arrange',
        eyebrow: 'Your move',
        title: 'Arrange five sets',
        note: 'Strongest in round 1, weakest in round 5',
      };
    case 'locked':
      return { id: 'locked', eyebrow: 'Sets locked', title: 'Waiting for the table', note: 'Your opponents are still arranging' };
    case 'play': {
      const result = state.roundStage === 'scored' ? state.results[state.round] : undefined;
      if (result) {
        const tie = result.tied.length > 1;
        return {
          id: `winner-${state.round}`,
          eyebrow: 'Round winner',
          title: state.players[result.winner].name,
          note: `+${plural(result.points, 'point')}${tie ? ' · exact tie, last to play wins' : ''}`,
          accent: true,
          caption: true,
        };
      }
      if (state.round < 0) return null;
      const points = state.round + 1;
      return {
        id: `round-${state.round}`,
        eyebrow: 'Now playing',
        title: `Round ${state.round + 1} of ${ROUNDS}`,
        note: `${plural(points, 'point')} at stake`,
        caption: true,
      };
    }
    default:
      return null;
  }
}

/** Text at the centre of the felt: the phase, the round and the winner of each round. */
export function CentreStage({ state, g }: { state: GameState; g: Geometry }) {
  const banner = bannerFor(state);
  const revealed = state.phase === 'play' && (state.roundStage === 'revealed' || state.roundStage === 'scored');
  const result = state.roundStage === 'scored' ? state.results[state.round] : undefined;
  const width = Math.max(200, g.table.rx * 0.8 - g.cardW * g.playScale * 2.6);

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      <div className="absolute flex justify-center" style={{ left: g.banner.x - 200, width: 400, top: g.banner.y, transform: 'translateY(-50%)' }}>
        <AnimatePresence mode="wait">
          {banner && (
            <motion.div
              key={banner.id}
              className="flex flex-col items-center text-center"
              style={{ maxWidth: state.phase === 'play' ? width : 380 }}
              initial={{ opacity: 0, y: 10, filter: 'blur(4px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(4px)' }}
              transition={{ duration: 0.32 }}
            >
              <div className={`label-caps !text-[9.5px] ${banner.accent ? 'text-gold-soft' : 'text-gold/85'}`}>{banner.eyebrow}</div>
              <div
                className="mt-1 font-serif font-semibold leading-[1.02] text-ivory"
                style={{ fontSize: Math.min(34, g.height * 0.04), textShadow: '0 2px 14px rgba(0,0,0,0.6)' }}
              >
                {banner.title}
              </div>
              {banner.note && (
                <div className={banner.caption ? 'label-caps mt-2 !text-[10px] text-gold-soft' : 'mt-1.5 text-[11.5px] leading-snug text-ivory/65'}>
                  {banner.note}
                </div>
              )}
              <div className="gold-rule mt-2.5 w-24" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* What each player revealed this round */}
      <AnimatePresence>
        {revealed &&
          SEATS.map((seat) => {
            const set = state.players[seat].sets?.[state.round];
            if (!set) return null;
            const info = describeSet(set);
            const won = result?.winner === seat;
            const lost = result !== undefined && !won;
            return (
              <motion.div
                key={`${state.round}-${seat}`}
                className="absolute flex -translate-x-1/2 flex-col items-center whitespace-nowrap"
                style={{ left: g.play[seat].x, top: g.play[seat].y + (g.cardH * g.playScale) / 2 + 9 }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: lost ? 0.45 : 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.45, duration: 0.3 }}
              >
                <div className={`label-caps !text-[9px] ${won ? 'text-gold-soft' : 'text-ivory/85'}`}>{info.label}</div>
                <div className="text-[10.5px] text-ivory/55">{info.detail}</div>
              </motion.div>
            );
          })}
      </AnimatePresence>

      {/* The round's points travel to the winner's score */}
      <AnimatePresence>
        {result && (
          <motion.div
            key={`token-${state.round}`}
            className="tabular absolute left-0 top-0 flex h-9 w-9 items-center justify-center rounded-full font-serif text-[17px] font-bold text-[#3a2a0c]"
            style={{
              background: 'radial-gradient(circle at 35% 28%, #f6e8c0 0%, #c8a45d 50%, #8a6d37 100%)',
              boxShadow: '0 0 0 1px #5f4a22, 0 0 22px rgba(226,201,143,0.7), 0 6px 12px rgba(0,0,0,0.5)',
            }}
            initial={{ x: g.play[result.winner].x - 18, y: g.play[result.winner].y - 18, scale: 0, opacity: 0 }}
            animate={{
              x: [g.play[result.winner].x - 18, g.play[result.winner].x - 18, g.plates[result.winner].x + 52],
              y: [g.play[result.winner].y - 18, g.play[result.winner].y - 30, g.plates[result.winner].y + 18],
              scale: [0, 1.15, 0.5],
              opacity: [0, 1, 0],
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.25, times: [0, 0.35, 1], ease: 'easeInOut', delay: 0.15 }}
          >
            +{result.points}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
