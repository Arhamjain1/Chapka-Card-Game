import { BookOpen, Bot, LogOut, Settings, Volume2, VolumeX, WandSparkles } from 'lucide-react';
import { ROUNDS } from '../engine/rules.ts';
import { scoreOf, type GameState } from '../game/controller.ts';
import { game } from '../game/useGame.ts';

function Scoreboard({ state }: { state: GameState }) {
  const played = state.results.length;
  return (
    <div className="panel rounded-md px-3 pt-1.5 pb-2" aria-label="Scoreboard">
      <table className="border-separate border-spacing-0 text-[11px]">
        <thead>
          <tr className="label-caps !text-[7.5px] text-ivory/40">
            <th className="pr-4 text-left font-semibold">Scoreboard</th>
            {Array.from({ length: ROUNDS }, (_, round) => (
              <th key={round} className={`w-[26px] text-center font-semibold ${state.phase === 'play' && state.round === round ? 'text-gold-soft' : ''}`}>
                R{round + 1}
              </th>
            ))}
            <th className="w-[38px] pl-2 text-center font-semibold">Won</th>
            <th className="w-[38px] text-right font-semibold">Total</th>
          </tr>
        </thead>
        <tbody>
          {state.players.map((player) => {
            const won = player.roundPoints.filter((points) => points > 0).length;
            return (
              <tr key={player.seat} className="leading-[17px]">
                <td className="max-w-[92px] truncate pr-4 font-serif text-[14px] font-semibold text-ivory/90">{player.name}</td>
                {player.roundPoints.map((points, round) => (
                  <td key={round} className="text-center">
                    {points > 0 ? (
                      <span className="tabular inline-flex h-[15px] w-[18px] items-center justify-center rounded-[3px] bg-gold text-[10px] font-bold text-ink">
                        {points}
                      </span>
                    ) : (
                      <span className={round < played ? 'text-ivory/30' : 'text-ivory/15'}>{round < played ? '–' : '·'}</span>
                    )}
                  </td>
                ))}
                <td className="tabular pl-2 text-center text-ivory/70">{won}</td>
                <td className="tabular text-right font-serif text-[16px] font-semibold text-gold-soft">{scoreOf(player)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function NavButton({ label, onClick, children, showLabel = false }: { label: string; onClick: () => void; children: React.ReactNode; showLabel?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className="label-caps flex h-9 items-center gap-2 rounded-[5px] px-2.5 text-ivory/65 transition hover:bg-white/5 hover:text-gold-soft"
      onClick={() => {
        game.sound.click();
        onClick();
      }}
    >
      {children}
      {showLabel && <span>{label}</span>}
    </button>
  );
}

export function TopBar({
  state,
  compact,
  onOptimiser,
  onRules,
  onSettings,
  onExit,
}: {
  state: GameState;
  /** Narrow windows show the navigation as icons only, leaving room for the scoreboard. */
  compact: boolean;
  onOptimiser: () => void;
  onRules: () => void;
  onSettings: () => void;
  onExit: () => void;
}) {
  const inGame = state.phase !== 'lobby';
  const sound = state.settings.sound;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[61] flex items-start justify-between px-6 pt-3">
      <div className="pointer-events-auto flex h-9 items-center gap-4">
        <div
          className="font-serif text-[27px] font-semibold leading-none tracking-[0.3em]"
          style={{
            background: 'linear-gradient(180deg, #f1e1b6 0%, #c8a45d 55%, #8f7340 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          CHAPKA
        </div>
        {inGame && (
          <div
            className="label-caps flex items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 py-1 !text-[8.5px] text-ivory/60"
            style={{ boxShadow: '0 0 0 1px rgba(200,164,93,0.28) inset' }}
            title="You are playing against two computer opponents"
          >
            <Bot size={12} className="text-gold" />
            vs Computer
            {state.session.games > 0 && <span className="text-ivory/35">· Game {state.gameNumber}</span>}
          </div>
        )}
      </div>

      {inGame && state.phase !== 'results' && (
        <div className="pointer-events-auto absolute left-1/2 top-2 -translate-x-1/2">
          <Scoreboard state={state} />
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-0.5">
        <NavButton label="Optimiser" onClick={onOptimiser} showLabel={!compact}>
          <WandSparkles size={15} />
        </NavButton>
        <NavButton label="Rules" onClick={onRules} showLabel={!compact}>
          <BookOpen size={15} />
        </NavButton>
        <NavButton label={sound ? 'Mute sound' : 'Turn sound on'} onClick={() => game.updateSettings({ sound: !sound })}>
          {sound ? <Volume2 size={16} /> : <VolumeX size={16} />}
        </NavButton>
        <NavButton label="Settings" onClick={onSettings}>
          <Settings size={16} />
        </NavButton>
        {inGame && (
          <NavButton label="Exit game" onClick={onExit} showLabel={!compact}>
            <LogOut size={15} />
          </NavButton>
        )}
      </div>
    </div>
  );
}
