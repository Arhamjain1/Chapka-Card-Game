import { AnimatePresence, motion } from 'framer-motion';
import { ROUNDS, SET_SIZE, type Seat } from '../engine/rules.ts';
import { scoreOf, type GameState, type PlayerState } from '../game/controller.ts';
import { AnimatedNumber, Avatar } from './common.tsx';
import type { Geometry } from './layout.ts';

const STATUS_TEXT: Record<PlayerState['status'], string> = {
  idle: 'Waiting',
  thinking: 'Thinking',
  ready: 'Ready',
  playing: 'Playing',
};

const STATUS_COLOUR: Record<PlayerState['status'], string> = {
  idle: 'rgba(242,235,221,0.35)',
  thinking: '#C8A45D',
  ready: '#7FC8A0',
  playing: '#E2C98F',
};

const ORDER_LABELS = ['1st', '2nd', 'Last'];

function cardsRemaining(state: GameState, player: PlayerState): number {
  if (player.sets) {
    const played = state.phase === 'results' ? ROUNDS : state.round < 0 ? 0 : state.round + (state.placed.includes(player.seat) ? 1 : 0);
    return (ROUNDS - Math.min(ROUNDS, played)) * SET_SIZE;
  }
  if (player.seat === 0 && state.slots) return ROUNDS * SET_SIZE;
  return player.hand.length;
}

export function DealerBadge() {
  return (
    <motion.div
      layoutId="dealer-badge"
      className="absolute z-10 flex h-[34px] w-[34px] items-center justify-center rounded-full"
      style={{
        left: -23,
        top: 'calc(50% - 17px)',
        background: 'radial-gradient(circle at 35% 28%, #f3e2b4 0%, #c8a45d 48%, #8a6d37 100%)',
        boxShadow: '0 0 0 1px #5f4a22, 0 0 0 2px rgba(226,201,143,0.5), 0 5px 10px rgba(0,0,0,0.6), inset 0 1px 1px rgba(255,255,255,0.6)',
      }}
      transition={{ type: 'spring', stiffness: 230, damping: 24 }}
      title="Dealer"
    >
      <span className="text-[6.5px] font-bold tracking-[0.08em] text-[#3a2a0c]">DEALER</span>
    </motion.div>
  );
}

function SeatPlate({ state, player, g }: { state: GameState; player: PlayerState; g: Geometry }) {
  const seat = player.seat as Seat;
  const human = seat === 0;
  const position = g.plates[seat];
  const width = human ? Math.min(g.side - 8, 212) : 204;
  const score = scoreOf(player);
  const scored = state.roundStage === 'scored' ? state.results[state.round] : undefined;
  const wonRound = scored?.winner === seat;
  const orderIndex = state.phase === 'play' && state.roundStage !== 'idle' ? state.order.indexOf(seat) : -1;
  const choosing = state.phase === 'dealer' && !state.dealerSettled && state.dealer === seat;
  const status = state.phase === 'results' ? 'idle' : player.status;

  return (
    <motion.div
      className="panel absolute rounded-lg"
      style={{ left: position.x - width / 2, top: position.y, width, y: '-50%' }}
      animate={{
        boxShadow: wonRound
          ? '0 0 0 1px rgba(226,201,143,0.95), 0 0 34px rgba(200,164,93,0.45), 0 18px 40px rgba(0,0,0,0.55)'
          : choosing
            ? '0 0 0 1px rgba(226,201,143,0.8), 0 0 20px rgba(200,164,93,0.3), 0 18px 40px rgba(0,0,0,0.55)'
            : `0 0 0 1px rgba(200,164,93,${human ? 0.42 : 0.22}), 0 0 0px rgba(200,164,93,0), 0 18px 40px rgba(0,0,0,0.55)`,
      }}
      transition={{ duration: 0.35 }}
    >
      <AnimatePresence>
        {orderIndex >= 0 && (
          <motion.span
            key={`${state.round}-${orderIndex}`}
            className="label-caps absolute -top-[9px] right-3 rounded-[3px] px-1.5 py-[3px] !text-[8px] text-gold-soft"
            style={{ background: '#0d1c18', boxShadow: '0 0 0 1px rgba(200,164,93,0.55) inset' }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            title="Playing order this round. Exact ties go to whoever plays last."
          >
            {ORDER_LABELS[orderIndex]}
          </motion.span>
        )}
      </AnimatePresence>
      <div className="flex items-center gap-3 pt-3 pr-3 pb-2 pl-[26px]">
        <div className="relative">
          <Avatar kind={player.kind} name={player.name} size={human ? 58 : 54} active={wonRound || player.status === 'thinking'} />
          {state.dealer === seat && <DealerBadge />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-[21px] font-semibold leading-[1.05] text-ivory">{player.name}</div>
          <div className="label-caps mt-0.5 truncate !text-[8.5px] text-gold/75">{player.title}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-ivory/75">
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${status === 'thinking' ? 'pulse' : ''}`}
              style={{ background: STATUS_COLOUR[status], boxShadow: `0 0 6px ${STATUS_COLOUR[status]}` }}
            />
            <span>{human && status === 'thinking' ? 'Your move' : STATUS_TEXT[status]}</span>
            {status === 'thinking' && !human && <span className="pulse -ml-1">…</span>}
          </div>
        </div>
      </div>
      <div className="gold-rule mx-3 opacity-50" />
      <div className="flex items-stretch px-3 py-2">
        <div className="flex-1">
          <div className="label-caps !text-[8px] text-ivory/45">Cards</div>
          <div className="tabular text-[15px] font-medium leading-tight text-ivory/90">{cardsRemaining(state, player)}</div>
        </div>
        <div className="flex-1 text-right">
          <div className="label-caps !text-[8px] text-ivory/45">Score</div>
          <div className="relative font-serif text-[24px] font-semibold leading-[0.9] text-gold-soft">
            <AnimatedNumber value={score} delay={wonRound ? 0.75 : 0} />
            <AnimatePresence>
              {wonRound && scored && (
                <motion.span
                  key={state.round}
                  className="tabular absolute -top-1 right-full mr-2 font-sans text-[12px] font-semibold text-gold-soft"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: [0, 1, 1, 0], y: [8, 0, 0, -8] }}
                  transition={{ duration: 2.2, delay: 0.7, times: [0, 0.15, 0.8, 1] }}
                >
                  +{scored.points}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function Seats({ state, g }: { state: GameState; g: Geometry }) {
  return (
    <div className="absolute inset-0 z-10">
      {state.players.map((player) => (
        <SeatPlate key={player.seat} state={state} player={player} g={g} />
      ))}
    </div>
  );
}
