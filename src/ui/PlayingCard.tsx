import { memo } from 'react';
import { motion } from 'framer-motion';
import { RANK_LABELS, rankOf, suitOf, type Card } from '../engine/cards.ts';

const RED = '#A8242C';
const BLACK = '#1A1C1D';

/** Suit outlines drawn in a 32 x 32 box. */
const SUIT_PATHS = [
  // Spade
  'M16 2.5C16 2.5 3.5 11.6 3.5 19.1c0 3.7 2.9 6.1 6.1 6.1 2.2 0 4-1 5.200-2.600-.200 2.800-1.400 5.200-3.600 6.900h9.600c-2.200-1.700-3.400-4.100-3.600-6.900 1.200 1.600 3 2.600 5.200 2.600 3.200 0 6.100-2.400 6.100-6.100C28.500 11.600 16 2.500 16 2.500Z',
  // Heart
  'M16 28.6S3.5 20.6 3.5 11.6C3.5 7.1 7 4 10.6 4c2.400 0 4.400 1.400 5.400 3.600C17 5.400 19 4 21.400 4 25 4 28.500 7.100 28.500 11.600 28.500 20.600 16 28.600 16 28.600Z',
  // Diamond
  'M16 2.4c2.500 5.500 6.400 10.100 10.900 13.600C22.400 19.500 18.500 24.100 16 29.600 13.500 24.100 9.600 19.500 5.100 16 9.600 12.500 13.500 7.900 16 2.400Z',
  // Club
  'M16 3.200a6.300 6.300 0 0 0-5.300 9.700 6.300 6.300 0 1 0 4.100 9.900c-.300 2.600-1.500 4.900-3.600 6.700h9.600c-2.100-1.800-3.300-4.100-3.600-6.700a6.300 6.300 0 1 0 4.100-9.900A6.300 6.300 0 0 0 16 3.200Z',
];

function Suit({ suit, x, y, size, flip = false }: { suit: number; x: number; y: number; size: number; flip?: boolean }) {
  const scale = size / 32;
  const rotate = flip ? ` rotate(180 16 16)` : '';
  return <path d={SUIT_PATHS[suit]} transform={`translate(${x - size / 2} ${y - size / 2}) scale(${scale})${rotate}`} />;
}

const COLUMN = { left: 34, mid: 50, right: 66 };

/** Pip positions [x, y] for ranks 2 to 10; pips below the middle are drawn upside down. */
const PIPS: Record<number, [number, number][]> = {
  0: [[COLUMN.mid, 30], [COLUMN.mid, 110]],
  1: [[COLUMN.mid, 30], [COLUMN.mid, 70], [COLUMN.mid, 110]],
  2: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.left, 110], [COLUMN.right, 110]],
  3: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.mid, 70], [COLUMN.left, 110], [COLUMN.right, 110]],
  4: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.left, 70], [COLUMN.right, 70], [COLUMN.left, 110], [COLUMN.right, 110]],
  5: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.mid, 50], [COLUMN.left, 70], [COLUMN.right, 70], [COLUMN.left, 110], [COLUMN.right, 110]],
  6: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.mid, 50], [COLUMN.left, 70], [COLUMN.right, 70], [COLUMN.mid, 90], [COLUMN.left, 110], [COLUMN.right, 110]],
  7: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.left, 56.7], [COLUMN.right, 56.7], [COLUMN.mid, 70], [COLUMN.left, 83.3], [COLUMN.right, 83.3], [COLUMN.left, 110], [COLUMN.right, 110]],
  8: [[COLUMN.left, 30], [COLUMN.right, 30], [COLUMN.mid, 43.4], [COLUMN.left, 56.7], [COLUMN.right, 56.7], [COLUMN.left, 83.3], [COLUMN.right, 83.3], [COLUMN.mid, 96.6], [COLUMN.left, 110], [COLUMN.right, 110]],
};

function CornerIndex({ rank, suit }: { rank: number; suit: number }) {
  const label = RANK_LABELS[rank];
  return (
    <g>
      <text
        x={13.5}
        y={25.5}
        textAnchor="middle"
        fontSize={label === '10' ? 21 : 24.5}
        letterSpacing={label === '10' ? -2 : 0}
        fontWeight={700}
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        {label}
      </text>
      <Suit suit={suit} x={13.5} y={37} size={14.5} />
    </g>
  );
}

function CardFace({ card }: { card: Card }) {
  const rank = rankOf(card);
  const suit = suitOf(card);
  const colour = suit === 1 || suit === 2 ? RED : BLACK;
  const court = rank >= 9 && rank <= 11;

  return (
    <svg viewBox="0 0 100 140" className="block h-full w-full" fill={colour} aria-hidden="true">
      <rect x={3.2} y={3.2} width={93.6} height={133.6} rx={4.5} fill="none" stroke="#80663D" strokeOpacity={0.28} strokeWidth={0.5} />
      <CornerIndex rank={rank} suit={suit} />
      <g transform="rotate(180 50 70)">
        <CornerIndex rank={rank} suit={suit} />
      </g>

      {rank === 12 && (
        <g>
          <circle cx={50} cy={70} r={30} fill="none" stroke={colour} strokeOpacity={0.22} strokeWidth={0.6} />
          <circle cx={50} cy={70} r={33} fill="none" stroke="#C8A45D" strokeOpacity={0.5} strokeWidth={0.4} />
          <Suit suit={suit} x={50} y={70} size={40} />
        </g>
      )}

      {court && (
        <g>
          <rect x={25} y={19} width={50} height={102} rx={2.5} fill="#C8A45D" fillOpacity={0.1} stroke={colour} strokeOpacity={0.5} strokeWidth={0.6} />
          <rect x={27.2} y={21.2} width={45.6} height={97.6} rx={1.5} fill="none" stroke="#80663D" strokeOpacity={0.45} strokeWidth={0.35} />
          <Suit suit={suit} x={34.5} y={30.5} size={11} />
          <Suit suit={suit} x={65.5} y={109.5} size={11} flip />
          <path d="M35 49H65M35 91H65" stroke={colour} strokeOpacity={0.45} strokeWidth={0.5} />
          <path d="M50 46.800 52.200 49 50 51.200 47.800 49ZM50 88.800 52.200 91 50 93.200 47.800 91Z" />
          <text
            x={50}
            y={83.5}
            textAnchor="middle"
            fontSize={42}
            fontWeight={600}
            style={{ fontFamily: 'var(--font-serif)' }}
          >
            {RANK_LABELS[rank]}
          </text>
        </g>
      )}

      {rank <= 8 &&
        PIPS[rank].map(([x, y], i) => <Suit key={i} suit={suit} x={x} y={y} size={rank >= 7 ? 15 : 16.5} flip={y > 70} />)}
    </svg>
  );
}

const BACK_SVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 140'>
<defs><pattern id='l' width='9' height='9' patternUnits='userSpaceOnUse' patternTransform='rotate(45 50 70)'>
<rect width='9' height='9' fill='#0E3027'/>
<path d='M0 0H9V9H0Z' fill='none' stroke='#C8A45D' stroke-width='0.5' opacity='0.7'/>
<path d='M4.500 2.600 6.400 4.500 4.500 6.400 2.600 4.500Z' fill='#C8A45D' opacity='0.55'/>
</pattern></defs>
<rect width='100' height='140' fill='#0B241D'/>
<rect x='6.500' y='6.500' width='87' height='127' rx='3.500' fill='url(#l)'/>
<rect x='6.500' y='6.500' width='87' height='127' rx='3.500' fill='none' stroke='#C8A45D' stroke-width='1.100'/>
<rect x='9.300' y='9.300' width='81.400' height='121.400' rx='2' fill='none' stroke='#C8A45D' stroke-width='0.350' opacity='0.850'/>
<path d='M50 43 70 70 50 97 30 70Z' fill='#0B241D' stroke='#C8A45D' stroke-width='1'/>
<path d='M50 49 65.500 70 50 91 34.500 70Z' fill='none' stroke='#C8A45D' stroke-width='0.450'/>
<path d='M50 59c0 0-7.200 5.200-7.200 9.500 0 2.100 1.700 3.500 3.500 3.500 1.300 0 2.300-.600 3-1.500-.100 1.600-.800 3-2.100 4h5.600c-1.300-1-2-2.400-2.100-4 .700.900 1.700 1.500 3 1.500 1.800 0 3.500-1.400 3.500-3.500C57.200 64.200 50 59 50 59Z' fill='#C8A45D'/>
</svg>`;

const BACK_IMAGE = `url("data:image/svg+xml,${encodeURIComponent(BACK_SVG)}")`;

export interface PlayingCardProps {
  card: Card;
  faceUp: boolean;
  /** Gold halo for winning cards and the centre card. */
  glow?: boolean;
  dim?: boolean;
  /** Gold outline for selected, picked or targeted cards. */
  outline?: boolean;
  flipDelay?: number;
}

/** One playing card with a face and a back; it turns over when `faceUp` changes. */
export const PlayingCard = memo(function PlayingCard({ card, faceUp, glow, dim, outline, flipDelay = 0 }: PlayingCardProps) {
  return (
    <div className="relative h-full w-full">
      {/* The dimming filter sits outside the turning element: a filter there would flatten the flip. */}
      <motion.div
        className="h-full w-full"
        style={{ perspective: 900 }}
        initial={false}
        animate={{ filter: dim ? 'brightness(0.5) saturate(0.7)' : 'brightness(1) saturate(1)' }}
        transition={{ duration: 0.5 }}
      >
        <motion.div
          className="card-3d relative h-full w-full"
          initial={false}
          animate={{ rotateY: faceUp ? 0 : 180 }}
          transition={{ duration: 0.55, ease: [0.3, 0.7, 0.3, 1], delay: flipDelay }}
        >
          <div className="card-face">
            <CardFace card={card} />
            <div className="card-sheen" />
          </div>
          <div className="card-back" style={{ backgroundImage: BACK_IMAGE }} />
        </motion.div>
      </motion.div>
      <motion.div
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius: '7%/5%' }}
        initial={false}
        animate={{
          boxShadow: glow
            ? '0 0 0 2px rgba(226,201,143,1), 0 0 26px 6px rgba(200,164,93,0.6)'
            : outline
              ? '0 0 0 2px rgba(200,164,93,0.95), 0 0 14px 1px rgba(200,164,93,0.35)'
              : '0 0 0 0px rgba(200,164,93,0), 0 0 0px 0px rgba(200,164,93,0)',
        }}
        transition={{ duration: 0.35 }}
      />
    </div>
  );
});
