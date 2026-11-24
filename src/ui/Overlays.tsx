import { motion } from 'framer-motion';
import { BookOpen, Play, RotateCcw, Sparkles, Trophy, WandSparkles } from 'lucide-react';
import { ROUNDS, ROUND_POINTS, TOTAL_POINTS } from '../engine/rules.ts';
import { OPPONENTS, scoreOf, type GameState } from '../game/controller.ts';
import { SPEED_FACTOR, type Speed } from '../game/settings.ts';
import { game } from '../game/useGame.ts';
import { Avatar, Button, Modal } from './common.tsx';
import { PlayingCard } from './PlayingCard.tsx';

const GOLD_TEXT = {
  background: 'linear-gradient(180deg, #f6e9c3 0%, #c8a45d 52%, #8f7340 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
} as const;

/** Title screen. */
export function Lobby({ onRules, onOptimiser }: { onRules: () => void; onOptimiser: () => void }) {
  // 10 of hearts, jack of clubs, queen of diamonds, king of hearts, ace of spades.
  const fan = [33, 39, 42, 45, 48];
  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse 80% 70% at 50% 45%, rgba(8,13,12,0.35) 0%, rgba(8,13,12,0.88) 100%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.5 } }}
    >
      <div className="flex w-[880px] max-w-[92%] items-center gap-14">
        <div className="flex-1">
          <motion.div
            className="label-caps text-gold/80"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
            A three-player game of five sets
          </motion.div>
          <motion.h1
            className="mt-3 font-serif font-semibold leading-[0.9]"
            style={{ ...GOLD_TEXT, fontSize: 104, letterSpacing: '0.14em' }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, duration: 0.6 }}
          >
            CHAPKA
          </motion.h1>
          <motion.div className="gold-rule mt-6 w-64 !bg-[linear-gradient(90deg,rgba(200,164,93,0.8),transparent)]" initial={{ scaleX: 0 }} animate={{ scaleX: 1 }} style={{ originX: 0 }} transition={{ delay: 0.45, duration: 0.7 }} />
          <motion.p
            className="mt-6 max-w-[430px] text-[14.5px] leading-relaxed text-ivory/75"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.55 }}
          >
            Seventeen cards. Five sets of three, played strongest first. Round one pays a single point and round five pays
            five, so the hand that wins is rarely the one that looks strongest.
          </motion.p>

          <motion.div className="mt-8 flex items-center gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}>
            <Button variant="gold" className="!h-11 !px-7 !text-[11px]" icon={<Play size={14} fill="currentColor" />} onClick={() => game.startGame('new')} autoFocus>
              Take a seat
            </Button>
            <Button className="!h-11 !px-5 !text-[11px]" icon={<WandSparkles size={14} />} onClick={onOptimiser} title="Type in a hand from a real game and get the best five sets">
              Optimise a hand
            </Button>
            <Button variant="ghost" className="!h-11" icon={<BookOpen size={14} />} onClick={onRules}>
              How to play
            </Button>
          </motion.div>

          <motion.div className="mt-10 flex gap-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.9 }}>
            {([1, 2] as const).map((seat) => (
              <div key={seat} className="flex max-w-[230px] items-start gap-3">
                <Avatar kind={OPPONENTS[seat].kind} name={OPPONENTS[seat].name} size={44} />
                <div>
                  <div className="font-serif text-[18px] font-semibold leading-tight text-ivory">{OPPONENTS[seat].name}</div>
                  <div className="label-caps !text-[8px] text-gold/75">{OPPONENTS[seat].title}</div>
                  <div className="mt-1 text-[11px] leading-snug text-ivory/50">{OPPONENTS[seat].blurb}</div>
                </div>
              </div>
            ))}
          </motion.div>
        </div>

        <div className="relative hidden h-[360px] w-[300px] shrink-0 md:block" aria-hidden="true">
          {fan.map((card, i) => {
            const offset = i - (fan.length - 1) / 2;
            return (
              <motion.div
                key={card}
                className="absolute left-1/2 top-1/2"
                style={{ width: 150, height: 210, marginLeft: -75, marginTop: -105, transformOrigin: '50% 135%' }}
                initial={{ rotate: 0, opacity: 0, y: 30 }}
                animate={{ rotate: offset * 13, opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + i * 0.09, type: 'spring', stiffness: 120, damping: 16 }}
              >
                <PlayingCard card={card} faceUp />
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.div>
  );
}

function Rule({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <h3 className="label-caps mb-1.5 text-gold-soft">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export function RulesModal({ onClose }: { onClose: () => void }) {
  const ranking: [string, string][] = [
    ['Three of a Kind', 'Three cards of one rank. Aces are highest, twos lowest.'],
    ['Pure Sequence', 'Three consecutive ranks in one suit. A-K-Q is highest, then A-2-3, then K-Q-J down to 4-3-2.'],
    ['Impure Sequence', 'Three consecutive ranks in mixed suits, in the same order.'],
    ['Suite', 'Three cards of one suit. Compare the highest card, then the next, then the last.'],
    ['Pair', 'Two cards of one rank. Compare the pair, then the third card.'],
    ['High Card', 'Anything else. Compare the highest card, then the next, then the last.'],
  ];
  return (
    <Modal title="How to play" onClose={onClose} width={640}>
      <Rule title="The deal">
        <p>Three players are dealt 17 cards each from one 52-card deck. The last card opens face-up at the centre.</p>
        <p>
          Whoever holds its twin picks it up. The twin is the same rank in the other suit of the same colour: hearts with
          diamonds, spades with clubs.
        </p>
      </Rule>
      <Rule title="Making sets">
        <p>
          Make five sets of three cards and discard the rest: 2 cards, or 3 if you picked up the centre card. Your sets must
          run from strongest (round 1) to weakest (round 5). This order cannot be changed.
        </p>
      </Rule>
      <Rule title="Set ranking, strongest first">
        <ol className="space-y-1">
          {ranking.map(([name, text], i) => (
            <li key={name} className="flex gap-3">
              <span className="tabular w-4 shrink-0 font-serif text-[15px] font-semibold text-gold">{i + 1}</span>
              <span>
                <span className="font-medium text-ivory">{name}.</span> {text}
              </span>
            </li>
          ))}
        </ol>
      </Rule>
      <Rule title="Playing and scoring">
        <p>
          In each of the five rounds all three players reveal that round's set together, and the strongest set wins. Round 1
          is worth 1 point, round 2 is worth 2, and so on up to 5 points for round 5. That is {TOTAL_POINTS} points in all,
          and the most points wins.
        </p>
        <p>
          Play runs anticlockwise. The player to the dealer's right plays first in round 1; after that, the player to the
          right of the last winner plays first. If the best sets are exactly equal, the tied player who plays last wins.
        </p>
      </Rule>
      <Rule title="The optimiser">
        <p>
          Optimise my hand picks your discards and arranges all five sets in one step. It searches every way of splitting
          your cards and takes the one with the highest expected points against two skilled opponents, breaking up a strong
          set when that wins more in the late rounds. Both computer players arrange their hands with the same optimiser.
          For a game at a real table, open the Optimiser from the top bar and type in your cards.
        </p>
      </Rule>
    </Modal>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={value} className="flex w-full items-center justify-between gap-6 rounded py-2 text-left" onClick={() => onChange(!value)}>
      <span>
        <span className="block text-[13.5px] text-ivory">{label}</span>
        <span className="block text-[11.5px] text-ivory/50">{hint}</span>
      </span>
      <span
        className="relative h-[22px] w-[40px] shrink-0 rounded-full transition"
        style={{ background: value ? '#c8a45d' : 'rgba(255,255,255,0.12)', boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.5)' }}
      >
        <motion.span
          className="absolute top-[3px] h-4 w-4 rounded-full bg-ivory shadow"
          initial={false}
          animate={{ left: value ? 21 : 3 }}
          transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        />
      </span>
    </button>
  );
}

export function SettingsModal({ state, onClose }: { state: GameState; onClose: () => void }) {
  const { settings } = state;
  const speeds: Speed[] = Object.keys(SPEED_FACTOR) as Speed[];
  return (
    <Modal title="Settings" onClose={onClose} width={460}>
      <label className="block">
        <span className="label-caps text-ivory/55">Your name</span>
        <input
          className="mt-1.5 h-10 w-full rounded-[5px] bg-black/35 px-3 font-serif text-[18px] text-ivory outline-none"
          style={{ boxShadow: '0 0 0 1px rgba(200,164,93,0.35) inset', userSelect: 'text' }}
          value={settings.name}
          maxLength={14}
          spellCheck={false}
          onChange={(event) => game.updateSettings({ name: event.target.value })}
        />
      </label>

      <div className="mt-5">
        <span className="label-caps text-ivory/55">Pace</span>
        <div className="mt-1.5 grid grid-cols-3 gap-1 rounded-[6px] bg-black/35 p-1" role="radiogroup" aria-label="Pace">
          {speeds.map((speed) => (
            <button
              key={speed}
              type="button"
              role="radio"
              aria-checked={settings.speed === speed}
              className={`label-caps h-8 rounded-[4px] transition ${settings.speed === speed ? 'bg-gold text-ink' : 'text-ivory/60 hover:text-ivory'}`}
              onClick={() => game.updateSettings({ speed })}
            >
              {speed}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 divide-y divide-white/5">
        <Toggle label="Sound effects" hint="Shuffling, dealing, card reveals and round wins" value={settings.sound} onChange={(sound) => game.updateSettings({ sound })} />
        <Toggle label="Win chance under each set" hint="Shows the optimiser's estimate while you arrange" value={settings.hints} onChange={(hints) => game.updateSettings({ hints })} />
        <Toggle label="Advance rounds automatically" hint="Moves to the next round without a click" value={settings.autoAdvance} onChange={(autoAdvance) => game.updateSettings({ autoAdvance })} />
      </div>
    </Modal>
  );
}

export function ExitModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Leave the table?"
      onClose={onClose}
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Keep playing
          </Button>
          <Button
            variant="gold"
            onClick={() => {
              game.exit();
              onClose();
            }}
          >
            Exit game
          </Button>
        </>
      }
    >
      This game will end and its score will be lost.
    </Modal>
  );
}

/** End-of-game screen with the winner, final scores and the round-by-round breakdown. */
export function Results({ state }: { state: GameState }) {
  const ranked = [...state.players].sort((a, b) => scoreOf(b) - scoreOf(a) || a.seat - b.seat);
  const top = scoreOf(ranked[0]);
  const winners = ranked.filter((player) => scoreOf(player) === top);
  const humanWon = winners.some((player) => player.seat === 0);
  const headline =
    winners.length > 1
      ? `${winners.map((player) => (player.seat === 0 ? 'You' : player.name)).join(' and ')} share the win`
      : humanWon
        ? 'You win the game'
        : `${winners[0].name} wins the game`;

  return (
    <motion.div
      className="absolute inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'radial-gradient(ellipse 75% 70% at 50% 42%, rgba(16,56,44,0.55) 0%, rgba(8,13,12,0.94) 75%)', backdropFilter: 'blur(5px)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.7 }}
    >
      <motion.div
        className="pointer-events-none absolute left-1/2 top-[36%] h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(200,164,93,0.22) 0%, transparent 62%)' }}
        initial={{ scale: 0.4, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />

      <div className="relative flex w-[720px] max-w-[92%] flex-col items-center">
        <motion.div
          className="flex h-16 w-16 items-center justify-center rounded-full text-[#3a2a0c]"
          style={{
            background: 'radial-gradient(circle at 35% 28%, #f6e8c0 0%, #c8a45d 50%, #8a6d37 100%)',
            boxShadow: '0 0 0 1px #5f4a22, 0 0 0 5px rgba(200,164,93,0.16), 0 0 44px rgba(200,164,93,0.5)',
          }}
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.35, type: 'spring', stiffness: 160, damping: 14 }}
        >
          {humanWon ? <Trophy size={28} strokeWidth={1.6} /> : <Sparkles size={26} strokeWidth={1.6} />}
        </motion.div>

        <motion.div className="label-caps mt-5 text-gold/85" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }}>
          {humanWon ? 'Victory' : 'Game over'} · {TOTAL_POINTS} points played
        </motion.div>
        <motion.h2
          className="mt-2 text-center font-serif font-semibold leading-[1.02]"
          style={{ ...GOLD_TEXT, fontSize: 56 }}
          initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          transition={{ delay: 0.7, duration: 0.7 }}
        >
          {headline}
        </motion.h2>

        <motion.div className="panel mt-7 w-full rounded-lg px-6 py-4" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.05, duration: 0.5 }}>
          <table className="w-full border-separate border-spacing-y-1">
            <thead>
              <tr className="label-caps !text-[8.5px] text-ivory/45">
                <th className="pb-1 text-left font-semibold">Player</th>
                {ROUND_POINTS.map((points, round) => (
                  <th key={round} className="w-[62px] pb-1 text-center font-semibold">
                    Round {round + 1}
                    <span className="block !text-[7.5px] text-ivory/30">
                      {points} {points === 1 ? 'pt' : 'pts'}
                    </span>
                  </th>
                ))}
                <th className="w-[60px] pb-1 text-center font-semibold">Rounds won</th>
                <th className="w-[92px] pb-1 text-right font-semibold">Final score</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((player, index) => {
                const score = scoreOf(player);
                const leader = score === top;
                return (
                  <motion.tr key={player.seat} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.25 + index * 0.14 }}>
                    <td className="py-1.5">
                      <div className="flex items-center gap-3">
                        <Avatar kind={player.kind} name={player.name} size={38} active={leader} />
                        <div>
                          <div className={`font-serif text-[20px] font-semibold leading-none ${leader ? 'text-gold-soft' : 'text-ivory/85'}`}>{player.name}</div>
                          <div className="label-caps mt-1 !text-[7.5px] text-ivory/40">{player.title}</div>
                        </div>
                      </div>
                    </td>
                    {player.roundPoints.map((points, round) => (
                      <td key={round} className="text-center">
                        {points > 0 ? (
                          <span className="tabular inline-flex h-[24px] w-[30px] items-center justify-center rounded-[4px] bg-gold font-serif text-[16px] font-bold text-ink">
                            +{points}
                          </span>
                        ) : (
                          <span className="text-ivory/25">–</span>
                        )}
                      </td>
                    ))}
                    <td className="tabular text-center text-[14px] text-ivory/70">
                      {player.roundPoints.filter((points) => points > 0).length} <span className="text-ivory/30">/ {ROUNDS}</span>
                    </td>
                    <td className="text-right">
                      <span className={`tabular font-serif text-[30px] font-semibold leading-none ${leader ? 'text-gold-soft' : 'text-ivory/80'}`}>{score}</span>
                      <span className="tabular ml-1 text-[12px] text-ivory/35">/ {TOTAL_POINTS}</span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </motion.div>

        {state.session.games > 1 && (
          <motion.div className="mt-3 text-[11.5px] text-ivory/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.7 }}>
            This sitting, {state.session.games} games:{' '}
            {state.players.map((player) => `${player.name} ${state.session.wins[player.seat]}`).join(' · ')}
          </motion.div>
        )}

        <motion.div className="mt-7 flex gap-3" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.75 }}>
          <Button
            variant="gold"
            className="!h-11 !px-7 !text-[11px]"
            icon={<Play size={14} fill="currentColor" />}
            onClick={() => game.startGame('again')}
            title="Deal another game at this table; the deal passes to the next player"
            autoFocus
          >
            Play again
          </Button>
          <Button className="!h-11 !px-6 !text-[11px]" icon={<RotateCcw size={14} />} onClick={() => game.startGame('new')} title="Start a fresh sitting with a newly chosen dealer">
            New game
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
}
