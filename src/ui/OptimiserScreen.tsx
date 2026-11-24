import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, Loader, Shuffle, Trash2, WandSparkles, X } from 'lucide-react';
import { RANK_LABELS, SUIT_NAMES, SUIT_SYMBOLS, cardName, fullDeck, makeCard, parseCard, parseCards, rankOf, suitOf, type Card } from '../engine/cards.ts';
import { STRENGTH_COUNT, describeSet } from '../engine/evaluate.ts';
import { solveInstant, viewFromDetails, type Neighbour, type PlayerView, type Solution, type TableDetails } from '../engine/model.ts';
import { expectedPoints, makeValueTable, optimise } from '../engine/optimiser.ts';
import { mulberry32, randomSeed, shuffleInPlace } from '../engine/rng.ts';
import { HAND_SIZE, ROUND_POINTS, TOTAL_POINTS } from '../engine/rules.ts';
import { game } from '../game/useGame.ts';
import { OptimiserClient } from '../worker/client.ts';
import { AnimatedNumber, Button } from './common.tsx';

const SAMPLES = 400;
const MAX_CARDS = HAND_SIZE + 1;
const RANKS_HIGH_TO_LOW = Array.from({ length: 13 }, (_, i) => 12 - i);
const RED_INK = '#A8242C';

type Dealer = NonNullable<TableDetails['dealer']> | 'unknown';
type Picker = Neighbour | 'unknown';

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled = false,
}: {
  label: string;
  value: T;
  options: readonly [T, string][];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`flex rounded-[5px] bg-black/35 p-[3px] ${disabled ? 'opacity-35' : ''}`} role="radiogroup" aria-label={label}>
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={value === option}
          disabled={disabled}
          className={`label-caps h-6 whitespace-nowrap rounded-[3px] px-2 !text-[8.5px] transition ${value === option ? 'bg-gold text-ink' : 'text-ivory/55 hover:text-ivory'}`}
          onClick={() => onChange(option)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** A small card that shows only its rank and suit, so it stays readable at a glance. */
function IndexCards({ cards, dim = false }: { cards: readonly Card[]; dim?: boolean }) {
  return (
    <div className="flex gap-[5px]">
      <AnimatePresence mode="popLayout" initial={false}>
        {cards.map((card) => {
          const suit = suitOf(card);
          return (
            <motion.div
              key={card}
              layout
              className="flex h-[58px] w-[44px] flex-col items-center justify-center rounded-[5px] leading-none"
              style={{
                background: 'linear-gradient(160deg, #fdfaf3 0%, #ece3d0 100%)',
                color: suit === 1 || suit === 2 ? RED_INK : '#1a1c1d',
                boxShadow: '0 0 0 0.5px rgba(60,46,24,0.6), 0 5px 10px rgba(0,0,0,0.4)',
                filter: dim ? 'brightness(0.55) saturate(0.7)' : undefined,
              }}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22 }}
              aria-label={cardName(card)}
            >
              <span className="font-serif text-[25px] font-bold" style={{ letterSpacing: rankOf(card) === 8 ? '-0.06em' : 0 }}>
                {RANK_LABELS[rankOf(card)]}
              </span>
              <span className="mt-[2px] text-[16px]">{SUIT_SYMBOLS[suit]}</span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}

interface Refined {
  key: string;
  solution: Solution;
  seconds: number;
}

/** Type or tap a hand and get the discards and five sets with the highest expected points. */
export function OptimiserScreen({ onClose }: { onClose: () => void }) {
  const [cards, setCards] = useState<Card[]>([]);
  const [text, setText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [dealer, setDealer] = useState<Dealer>('unknown');
  const [picker, setPicker] = useState<Picker>('unknown');
  const [centreText, setCentreText] = useState('');
  const [refined, setRefined] = useState<Refined | null>(null);
  const client = useRef<OptimiserClient | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const instance = new OptimiserClient();
    client.current = instance;
    return () => instance.reset();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const selected = useMemo(() => new Set(cards), [cards]);
  const complete = cards.length === HAND_SIZE || cards.length === MAX_CARDS;
  const holdsCentre = cards.length === MAX_CARDS;

  /** The view of the table, or the reason the table details cannot be used. */
  const { view, detailError } = useMemo((): { view: PlayerView | null; detailError: string | null } => {
    if (!complete) return { view: null, detailError: null };
    const details: TableDetails = {};
    if (dealer !== 'unknown') details.dealer = dealer;
    let detailError: string | null = null;
    if (!holdsCentre && picker !== 'unknown') {
      details.picker = picker;
      if (centreText.trim()) {
        try {
          details.centre = parseCard(centreText);
        } catch {
          detailError = `Cannot read the centre card "${centreText.trim()}". Use a rank and a suit, for example 2H.`;
        }
      }
    } else if (!holdsCentre && centreText.trim()) {
      detailError = 'Choose who picked the centre card up, or clear the centre card.';
    }
    try {
      return { view: viewFromDetails(cards, details), detailError };
    } catch (error) {
      delete details.centre;
      return { view: viewFromDetails(cards, details), detailError: (error as Error).message };
    }
  }, [cards, complete, holdsCentre, dealer, picker, centreText]);

  const key = view ? JSON.stringify([[...view.hand].sort((a, b) => a - b), view.known, view.sizes, view.roundOneTieWin]) : '';
  const instant = useMemo(() => (complete ? solveInstant(cards) : null), [cards, complete]);

  useEffect(() => {
    if (!view || !client.current) return;
    let cancelled = false;
    const started = performance.now();
    client.current
      .winTable(view, SAMPLES)
      .then((win) => {
        if (cancelled) return;
        const arrangement = optimise(view.hand, makeValueTable(win));
        setRefined({
          key,
          solution: { arrangement, win, expected: expectedPoints(arrangement.strengths, win) },
          seconds: (performance.now() - started) / 1000,
        });
      })
      .catch((error: Error) => {
        if (!cancelled && error.message !== 'cancelled') console.error(error);
      });
    return () => {
      cancelled = true;
    };
    // `key` identifies the view, so the simulation restarts only when the hand or the details change.
  }, [key]);

  const checked = refined !== null && refined.key === key;
  const solution = checked ? refined.solution : instant;

  const toggle = useCallback(
    (card: Card) => {
      setMessage(null);
      if (selected.has(card)) {
        game.sound.deselect();
        setCards((current) => current.filter((other) => other !== card));
      } else if (cards.length >= MAX_CARDS) {
        game.sound.warn();
        setMessage(`A hand has at most ${MAX_CARDS} cards. Remove one first.`);
      } else {
        game.sound.select();
        setCards((current) => [...current, card]);
      }
    },
    [selected, cards.length],
  );

  /** Adds every readable card in the text box; anything unreadable stays there for correction. */
  const commit = useCallback(
    (raw: string) => {
      const { cards: typed, rejected } = parseCards(raw);
      const next = [...cards];
      let overflow = false;
      for (const card of typed) {
        if (next.includes(card)) continue;
        if (next.length >= MAX_CARDS) {
          overflow = true;
          break;
        }
        next.push(card);
      }
      if (next.length !== cards.length) game.sound.select();
      setCards(next);
      setText(rejected.join(' '));
      if (rejected.length > 0) {
        setMessage(`Cannot read ${rejected.map((token) => `"${token}"`).join(', ')}. Use a rank and a suit, for example AS, 10H, 7D or KC.`);
      } else if (overflow) {
        setMessage(`A hand has at most ${MAX_CARDS} cards, so the extra cards were left out.`);
      } else {
        setMessage(null);
      }
    },
    [cards],
  );

  const clear = () => {
    setCards([]);
    setText('');
    setMessage(null);
    setCentreText('');
    input.current?.focus();
  };

  const randomHand = () => {
    const deck = shuffleInPlace(fullDeck(), mulberry32(randomSeed()));
    setCards(deck.slice(0, HAND_SIZE));
    setText('');
    setMessage(null);
    setCentreText('');
  };

  const missing = HAND_SIZE - cards.length;

  return (
    <motion.div
      className="absolute inset-0 z-[62] overflow-y-auto"
      style={{ background: 'radial-gradient(ellipse 90% 80% at 50% 40%, #0d2a22 0%, #080d0c 78%)' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      role="dialog"
      aria-modal="true"
      aria-label="Optimiser"
    >
      <div className="mx-auto flex min-h-full w-[1180px] max-w-[96%] flex-col justify-center py-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="label-caps text-gold/80">Chapka</div>
            <h2 className="mt-1 font-serif text-[40px] font-semibold leading-none text-gold-soft">The Optimiser</h2>
            <p className="mt-2 max-w-[640px] text-[13px] leading-relaxed text-ivory/65">
              Type or tap your 17 or 18 cards. You get the cards to discard and your five sets, in playing order, that earn
              the most expected points against two skilled opponents.
            </p>
          </div>
          <Button variant="ghost" icon={<X size={15} />} onClick={onClose}>
            Close
          </Button>
        </div>
        <div className="gold-rule mt-4 mb-5 !bg-[linear-gradient(90deg,rgba(200,164,93,0.7),transparent)]" />

        <div className="flex items-start gap-6">
          {/* ------------------------------------------------ entering the hand */}
          <div className="min-w-0 flex-[1.08]">
            <div className="flex items-center gap-2">
              <input
                ref={input}
                autoFocus
                className="h-10 min-w-0 flex-1 rounded-[5px] bg-black/40 px-3 text-[14px] tracking-wide text-ivory outline-none placeholder:text-ivory/30"
                style={{ boxShadow: '0 0 0 1px rgba(200,164,93,0.4) inset', userSelect: 'text' }}
                placeholder="Type cards and press Enter:  AS KH 10D 7C …"
                aria-label="Type your cards"
                spellCheck={false}
                autoComplete="off"
                value={text}
                onChange={(event) => {
                  const value = event.target.value;
                  if (/[\s,;]$/.test(value)) commit(value);
                  else setText(value);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commit(text);
                  } else if (event.key === 'Backspace' && text === '' && cards.length > 0) {
                    setCards(cards.slice(0, -1));
                  }
                }}
                onPaste={(event) => {
                  event.preventDefault();
                  commit(`${text} ${event.clipboardData.getData('text')}`);
                }}
              />
              <div className="panel flex h-10 items-baseline gap-1 rounded-[5px] px-3 pt-[7px]" aria-live="polite">
                <span className="tabular font-serif text-[22px] font-semibold leading-none text-gold-soft">{cards.length}</span>
                <span className="label-caps !text-[8.5px] text-ivory/45">of 17 or 18</span>
              </div>
              <Button variant="ghost" className="!h-10" icon={<Trash2 size={13} />} onClick={clear} disabled={cards.length === 0 && text === ''}>
                Clear
              </Button>
            </div>
            <div className="mt-1.5 h-4 text-[11.5px] text-[#e58a7e]" role="alert">
              {message}
            </div>

            <div className="mt-1 grid gap-[5px]" style={{ gridTemplateColumns: '20px repeat(13, minmax(0, 1fr))' }}>
              {[0, 1, 2, 3].map((suit) => {
                const red = suit === 1 || suit === 2;
                return [
                  <div key={`suit-${suit}`} className="flex items-center justify-center text-[17px]" style={{ color: red ? '#c96a6f' : 'rgba(242,235,221,0.6)' }} title={SUIT_NAMES[suit]}>
                    {SUIT_SYMBOLS[suit]}
                  </div>,
                  ...RANKS_HIGH_TO_LOW.map((rank) => {
                    const card = makeCard(rank, suit);
                    const on = selected.has(card);
                    return (
                      <button
                        key={card}
                        type="button"
                        aria-pressed={on}
                        aria-label={cardName(card)}
                        className="flex h-[58px] flex-col items-center justify-center rounded-[5px] leading-none transition duration-100 hover:-translate-y-px active:translate-y-0"
                        style={
                          on
                            ? {
                                background: 'linear-gradient(160deg, #fdfaf3 0%, #f1e9d8 100%)',
                                color: red ? RED_INK : '#1a1c1d',
                                boxShadow: '0 0 0 1.5px #c8a45d, 0 6px 12px rgba(0,0,0,0.45)',
                              }
                            : {
                                background: 'rgba(255,255,255,0.035)',
                                color: red ? 'rgba(201,106,111,0.75)' : 'rgba(242,235,221,0.5)',
                                boxShadow: '0 0 0 1px rgba(200,164,93,0.16) inset',
                              }
                        }
                        onClick={() => toggle(card)}
                      >
                        <span className="font-serif text-[21px] font-bold" style={{ letterSpacing: rank === 8 ? '-0.06em' : 0 }}>
                          {RANK_LABELS[rank]}
                        </span>
                        <span className="mt-[1px] text-[13px]">{SUIT_SYMBOLS[suit]}</span>
                      </button>
                    );
                  }),
                ];
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <div className="flex items-center gap-2">
                  <span className="label-caps !text-[8.5px] text-ivory/45">Dealer</span>
                  <Segmented
                    label="Dealer"
                    value={dealer}
                    onChange={setDealer}
                    options={[['unknown', 'Not set'], ['me', 'Me'], ['right', 'On my right'], ['left', 'On my left']]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="label-caps whitespace-nowrap !text-[8.5px] text-ivory/45">Centre card taken by</span>
                  {holdsCentre ? (
                    <span className="label-caps flex h-[30px] items-center rounded-[5px] bg-black/35 px-2.5 !text-[8.5px] text-gold-soft">Me · 18 cards</span>
                  ) : (
                    <>
                      <Segmented
                        label="Centre card taken by"
                        value={picker}
                        onChange={setPicker}
                        options={[['unknown', 'Not set'], ['right', 'On my right'], ['left', 'On my left']]}
                      />
                      <input
                        className="h-[30px] w-[74px] rounded-[5px] bg-black/35 px-2 text-center text-[12px] uppercase text-ivory outline-none placeholder:normal-case placeholder:text-ivory/30"
                        style={{ boxShadow: '0 0 0 1px rgba(200,164,93,0.25) inset', userSelect: 'text' }}
                        placeholder="Card, 2H"
                        aria-label="Centre card"
                        spellCheck={false}
                        maxLength={3}
                        value={centreText}
                        onChange={(event) => setCentreText(event.target.value)}
                      />
                    </>
                  )}
                </div>
              </div>
              <Button variant="ghost" icon={<Shuffle size={13} />} onClick={randomHand} title="Fill in a random 17-card hand to try the optimiser">
                Random hand
              </Button>
            </div>
            <div className="mt-2 min-h-4 text-[11.5px] leading-snug text-ivory/40">
              {detailError ? (
                <span className="text-[#e58a7e]">{detailError}</span>
              ) : (
                'The table details are optional. Seats are as you see them: play passes to the player on your right.'
              )}
            </div>
          </div>

          {/* ------------------------------------------------ the answer */}
          <div className="panel w-[468px] shrink-0 rounded-lg px-5 py-4">
            {solution ? (
              <>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="label-caps !text-[8.5px] text-ivory/50">Expected points</div>
                    <div className="mt-0.5 font-serif text-[38px] font-semibold leading-none text-gold-soft">
                      <AnimatedNumber value={solution.expected} decimals={1} />
                      <span className="ml-2 text-[20px] text-ivory/40">/ {TOTAL_POINTS}</span>
                    </div>
                  </div>
                  <div className="label-caps flex items-center gap-1.5 pb-1 !text-[8.5px] text-ivory/55" aria-live="polite">
                    {checked ? (
                      <>
                        <Check size={12} className="text-[#7FC8A0]" />
                        Checked on {SAMPLES} deals · {refined.seconds.toFixed(1)}s
                      </>
                    ) : (
                      <>
                        <Loader size={12} className="animate-spin text-gold" />
                        Instant answer · checking
                      </>
                    )}
                  </div>
                </div>
                <div className="gold-rule my-3 opacity-60" />

                <div className="flex flex-col gap-[7px]">
                  {solution.arrangement.sets.map((set, round) => {
                    const info = describeSet(set);
                    const chance = solution.win[round * STRENGTH_COUNT + info.strength];
                    const points = ROUND_POINTS[round];
                    return (
                      <div key={round} className="flex items-center gap-3.5">
                        <div className="w-[62px] shrink-0">
                          <div className="label-caps !text-[9.5px] text-ivory/90">Round {round + 1}</div>
                          <div className="label-caps mt-0.5 !text-[8px] text-gold/80">
                            {points} {points === 1 ? 'point' : 'points'}
                          </div>
                        </div>
                        <IndexCards cards={set} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate font-serif text-[17px] font-semibold leading-tight text-ivory">{info.label}</span>
                            <span className="tabular shrink-0 text-[12px] font-medium text-gold-soft">{Math.round(chance * 100)}%</span>
                          </div>
                          <div className="flex items-baseline justify-between gap-2 text-[10.5px] text-ivory/50">
                            <span className="truncate">{info.detail}</span>
                            <span className="shrink-0">to win</span>
                          </div>
                          <div className="mt-1 h-[3px] overflow-hidden rounded-full bg-white/10">
                            <motion.div
                              className="h-full rounded-full"
                              style={{ background: 'linear-gradient(90deg, #80663d, #e2c98f)' }}
                              initial={false}
                              animate={{ width: `${Math.max(2, chance * 100)}%` }}
                              transition={{ duration: 0.4 }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="gold-rule my-3 opacity-40" />
                <div className="flex items-center gap-3.5">
                  <div className="w-[62px] shrink-0">
                    <div className="label-caps !text-[9.5px] text-[#e58a7e]">Discard</div>
                    <div className="label-caps mt-0.5 !text-[8px] text-ivory/40">{solution.arrangement.discards.length} cards</div>
                  </div>
                  <IndexCards cards={solution.arrangement.discards} dim />
                  <div className="min-w-0 flex-1 text-[10.5px] leading-snug text-ivory/45">Not used in any set.</div>
                </div>
              </>
            ) : (
              <div className="flex h-[470px] flex-col items-center justify-center text-center">
                <WandSparkles size={30} strokeWidth={1.3} className="text-gold/70" />
                <div className="mt-4 font-serif text-[26px] font-semibold leading-tight text-ivory">
                  {cards.length === 0 ? 'Enter your hand' : `${missing} more ${missing === 1 ? 'card' : 'cards'}`}
                </div>
                <p className="mt-2 max-w-[300px] text-[12.5px] leading-relaxed text-ivory/50">
                  The answer appears the moment your 17th card goes in. Add an 18th if you picked up the centre card.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
