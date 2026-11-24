import { AnimatePresence, motion } from 'framer-motion';
import { ArrowDownWideNarrow, ChevronRight, Lightbulb, Loader, Lock, RotateCcw, TriangleAlert, Undo2, WandSparkles } from 'lucide-react';
import { STRENGTH_COUNT, describeSet } from '../engine/evaluate.ts';
import { ROUNDS, ROUND_POINTS, TOTAL_POINTS, checkArrangement, discardCount } from '../engine/rules.ts';
import type { GameState } from '../game/controller.ts';
import { game } from '../game/useGame.ts';
import { AnimatedNumber, Button } from './common.tsx';
import type { Geometry } from './layout.ts';

const TRAY_TOP = 30;
const TRAY_BOTTOM = 42;

/** The five round trays behind the human's sets, with each set's type and strength. */
export function SlotTrays({ state, g }: { state: GameState; g: Geometry }) {
  const sets = state.slots ?? state.players[0].sets;
  const visible = sets !== null && state.phase !== 'results';
  const arranging = state.phase === 'arrange';
  const check = sets ? checkArrangement(sets) : null;
  const top = g.slots.y - g.cardH / 2 - TRAY_TOP;
  const height = g.cardH + TRAY_TOP + TRAY_BOTTOM;

  return (
    <AnimatePresence>
      {visible && sets && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-[15]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        >
          {sets.map((set, round) => {
            const info = describeSet(set);
            const points = ROUND_POINTS[round];
            const outOfOrder = arranging && round > 0 && check !== null && check.strengths[round] > check.strengths[round - 1];
            const result = state.results[round];
            const current = state.phase === 'play' && state.round === round && state.roundStage !== 'idle';
            const chance = state.settings.hints && state.optimiserReady ? game.winChance(round, info.strength) : null;
            const fill = chance ?? info.strength / (STRENGTH_COUNT - 1);
            const weight = 0.16 + round * 0.09;
            const border = outOfOrder
              ? 'rgba(214,96,84,0.9)'
              : current
                ? 'rgba(226,201,143,0.95)'
                : `rgba(200,164,93,${weight})`;

            return (
              <motion.div
                key={round}
                className="absolute rounded-[7px]"
                style={{
                  left: g.slots.centres[round] - g.slots.width / 2,
                  top,
                  width: g.slots.width,
                  height,
                  background: `linear-gradient(180deg, rgba(200,164,93,${0.03 + round * 0.012}) 0%, rgba(8,13,12,0.55) 38%, rgba(8,13,12,0.72) 100%)`,
                }}
                animate={{
                  boxShadow: `0 0 0 1px ${border} inset, 0 0 ${current ? 22 : 0}px rgba(200,164,93,${current ? 0.3 : 0})`,
                  opacity: result && !current ? 0.55 : 1,
                }}
                transition={{ duration: 0.3 }}
              >
                <div className="flex items-center justify-between px-2.5" style={{ height: TRAY_TOP - 6, marginTop: 3 }}>
                  <span className="label-caps whitespace-nowrap !text-[9px] text-ivory/85">Round {round + 1}</span>
                  <span className="label-caps flex items-center gap-1.5 whitespace-nowrap !text-[9px] text-gold-soft">
                    {g.slots.width >= 176 && (
                      <span className="flex gap-[3px]" aria-hidden="true">
                        {Array.from({ length: points }, (_, i) => (
                          <span key={i} className="h-[4px] w-[4px] rotate-45 bg-gold" />
                        ))}
                      </span>
                    )}
                    {points} {g.slots.width < 150 ? 'pt' : 'point'}
                    {points === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="absolute inset-x-2.5" style={{ bottom: 6 }}>
                  {result ? (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="label-caps truncate !text-[8px] !tracking-[0.05em] text-ivory/70">{info.label}</span>
                      <span className={`label-caps shrink-0 whitespace-nowrap !text-[9px] ${result.winner === 0 ? 'text-gold-soft' : 'text-ivory/40'}`}>
                        {result.winner === 0 ? `Won +${result.points}` : 'Lost'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={`label-caps truncate !text-[8px] !tracking-[0.05em] ${outOfOrder ? 'text-[#e58a7e]' : 'text-ivory/90'}`} title={`${info.label}, ${info.detail}`}>
                        {info.label}
                      </span>
                      <span className="tabular shrink-0 text-[10px] text-ivory/55" title="Chance that this set wins its round">
                        {chance !== null ? `${Math.round(chance * 100)}% win` : info.detail}
                      </span>
                    </div>
                  )}
                  <div className="mt-[5px] h-[3px] overflow-hidden rounded-full bg-white/10" title="Strength of this set for its round">
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: outOfOrder ? '#d66054' : 'linear-gradient(90deg, #80663d, #e2c98f)' }}
                      initial={false}
                      animate={{ width: `${Math.max(3, fill * 100)}%` }}
                      transition={{ duration: 0.45 }}
                    />
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function PanelShell({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <motion.div
      key={id}
      className="flex flex-col gap-2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      transition={{ duration: 0.28 }}
    >
      {children}
    </motion.div>
  );
}

function Readout({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="panel rounded-md px-3 py-2">
      <div className="label-caps !text-[8.5px] text-ivory/50">{label}</div>
      <div className="mt-0.5 font-serif text-[26px] font-semibold leading-none text-gold-soft">{children}</div>
    </div>
  );
}

/** The human's actions at the bottom right, and the order warning above the sets. */
export function HumanControls({ state, g }: { state: GameState; g: Geometry }) {
  const { phase } = state;
  const width = g.side - 22;
  const needed = discardCount(state.players[0].hand.length);
  const check = state.slots ? checkArrangement(state.slots) : null;
  const expected = check?.valid ? game.expected(check.strengths) : null;
  const busy = state.optimiserBusy;
  const lastRound = state.results.length === ROUNDS;

  let panel: React.ReactNode = null;
  if (phase === 'discard') {
    panel = (
      <PanelShell id="discard">
        <Readout label="Selected to discard">
          <span className="tabular">{state.selected.length}</span>
          <span className="mx-1.5 text-[18px] text-ivory/35">/</span>
          <span className="tabular">{needed}</span>
        </Readout>
        <Button
          icon={busy ? <Loader size={13} className="animate-spin" /> : <WandSparkles size={13} />}
          disabled={busy}
          onClick={() => void game.optimiseHand()}
          silent
          title="The optimiser picks your discards and arranges all five sets for the most expected points"
        >
          Optimise my hand
        </Button>
        <Button variant="gold" disabled={state.selected.length !== needed} onClick={() => game.confirmDiscards()} silent>
          Confirm discard
        </Button>
        <Button
          variant="ghost"
          icon={<Lightbulb size={13} />}
          disabled={busy}
          onClick={() => void game.suggestDiscards()}
          silent
          title="Only mark the discards the optimiser would make; you arrange the sets yourself"
        >
          Suggest discards
        </Button>
        <div className="flex items-center justify-between pl-1">
          <span className="label-caps !text-[8.5px] text-ivory/45">Sort hand</span>
          <div className="flex gap-1">
            <Button variant="ghost" className="!h-7 !px-2 !text-[9px]" onClick={() => game.sortHand('rank')} silent>
              Rank
            </Button>
            <Button variant="ghost" className="!h-7 !px-2 !text-[9px]" onClick={() => game.sortHand('suit')} silent>
              Suit
            </Button>
          </div>
        </div>
      </PanelShell>
    );
  } else if (phase === 'arrange') {
    panel = (
      <PanelShell id="arrange">
        <Readout label="Expected points">
          {check && !check.valid ? (
            <span className="font-sans text-[12px] font-normal text-[#e58a7e]">Sets out of order</span>
          ) : expected === null ? (
            <span className="pulse font-sans text-[12px] font-normal text-ivory/55">Reading the table…</span>
          ) : (
            <>
              <AnimatedNumber value={expected} decimals={1} />
              <span className="mx-1.5 text-[18px] text-ivory/35">/</span>
              <span className="text-[18px] text-ivory/55">{TOTAL_POINTS}</span>
            </>
          )}
        </Readout>
        <Button
          icon={busy ? <Loader size={13} className="animate-spin" /> : <WandSparkles size={13} />}
          disabled={busy}
          onClick={() => void game.autoArrange()}
          silent
          title="Arrange these 15 cards for the highest expected points"
        >
          Auto arrange
        </Button>
        <Button variant="ghost" icon={<RotateCcw size={13} />} onClick={() => game.resetArrangement()} silent>
          Reset arrangement
        </Button>
        <Button variant="gold" icon={<Lock size={13} />} disabled={!check?.valid} onClick={() => game.lockSets()} silent>
          Lock sets
        </Button>
        <button
          type="button"
          className="flex items-center justify-center gap-1.5 py-0.5 text-[10.5px] text-ivory/45 transition hover:text-gold-soft"
          onClick={() => game.changeDiscards()}
        >
          <Undo2 size={11} /> Change discards
        </button>
      </PanelShell>
    );
  } else if (phase === 'locked') {
    panel = (
      <PanelShell id="locked">
        <div className="panel rounded-md px-3 py-3 text-[11.5px] leading-snug text-ivory/65">
          <div className="label-caps mb-1 flex items-center gap-1.5 !text-[9px] text-gold-soft">
            <Lock size={11} /> Sets locked
          </div>
          Play begins when every player is ready.
        </div>
      </PanelShell>
    );
  } else if (phase === 'play') {
    panel = (
      <PanelShell id="play">
        <AnimatePresence>
          {state.awaitingAdvance && (
            <motion.div className="flex flex-col gap-1.5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Button variant="gold" icon={<ChevronRight size={14} />} className="!h-10" onClick={() => game.advance()} silent autoFocus>
                {lastRound ? 'See results' : 'Next round'}
              </Button>
              <div className="text-center text-[10px] text-ivory/40">or press Space</div>
            </motion.div>
          )}
        </AnimatePresence>
      </PanelShell>
    );
  }

  const offender = phase === 'arrange' && check && check.firstOutOfOrder > 0 ? check.firstOutOfOrder : -1;

  return (
    <>
      <div className="absolute z-30" style={{ right: 18, bottom: 22, width }}>
        <AnimatePresence mode="wait">{panel}</AnimatePresence>
      </div>

      <AnimatePresence>
        {offender > 0 && (
          <motion.div
            className="panel absolute z-30 flex items-center gap-3 rounded-md py-1.5 pl-3 pr-1.5"
            style={{ left: '50%', top: g.slots.y - g.cardH / 2 - TRAY_TOP - 46, boxShadow: '0 0 0 1px rgba(214,96,84,0.7), 0 14px 30px rgba(0,0,0,0.55)' }}
            initial={{ opacity: 0, y: 8, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 6, x: '-50%' }}
            role="alert"
          >
            <TriangleAlert size={14} className="shrink-0 text-[#e58a7e]" />
            <span className="whitespace-nowrap text-[11.5px] text-ivory/85">
              Round {offender + 1} is stronger than round {offender}. Sets must run from strongest to weakest.
            </span>
            <Button className="!h-7 !px-2.5 !text-[9px]" icon={<ArrowDownWideNarrow size={12} />} onClick={() => game.sortSets()} silent>
              Sort sets
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
