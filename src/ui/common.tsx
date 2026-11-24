import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { animate, motion } from 'framer-motion';
import { ChessKnight, Flame, X } from 'lucide-react';
import type { PlayerKind } from '../game/controller.ts';
import { game } from '../game/useGame.ts';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'gold' | 'outline' | 'ghost';
  icon?: ReactNode;
  silent?: boolean;
};

const VARIANTS: Record<NonNullable<ButtonProps['variant']>, string> = {
  gold:
    'text-ink bg-[linear-gradient(180deg,#ecd9a8_0%,#c8a45d_48%,#a98845_100%)] shadow-[0_1px_0_rgba(255,255,255,0.45)_inset,0_8px_18px_rgba(0,0,0,0.45)] hover:brightness-110 disabled:brightness-100',
  outline:
    'text-gold-soft bg-[rgba(200,164,93,0.06)] shadow-[0_0_0_1px_rgba(200,164,93,0.5)_inset] hover:bg-[rgba(200,164,93,0.16)] disabled:bg-[rgba(200,164,93,0.06)]',
  ghost: 'text-ivory/70 hover:text-ivory hover:bg-white/5 disabled:hover:bg-transparent',
};

export function Button({ variant = 'outline', icon, className = '', children, onClick, silent, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={`label-caps inline-flex h-9 items-center justify-center gap-2 rounded-[5px] px-3.5 whitespace-nowrap transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 ${VARIANTS[variant]} ${className}`}
      onClick={(event) => {
        if (!silent) game.sound.click();
        onClick?.(event);
      }}
      {...rest}
    >
      {icon}
      {children}
    </button>
  );
}

/** A number that counts smoothly to its new value. */
export function AnimatedNumber({ value, delay = 0, decimals = 0 }: { value: number; delay?: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const current = useRef(value);
  useEffect(() => {
    const controls = animate(current.current, value, {
      duration: 0.7,
      delay,
      ease: 'easeOut',
      onUpdate: (latest) => {
        current.current = latest;
        setShown(latest);
      },
    });
    return () => controls.stop();
  }, [value, delay]);
  return <span className="tabular">{shown.toFixed(decimals)}</span>;
}

export function Avatar({ kind, name, size = 58, active = false }: { kind: PlayerKind; name: string; size?: number; active?: boolean }) {
  const background =
    kind === 'strategist'
      ? 'radial-gradient(circle at 35% 28%, #2a6f5a 0%, #10382c 55%, #071812 100%)'
      : kind === 'maverick'
        ? 'radial-gradient(circle at 35% 28%, #7a3b2e 0%, #43201b 55%, #1a0c0a 100%)'
        : 'radial-gradient(circle at 35% 28%, #3c3a33 0%, #1d1f1c 55%, #0b0d0c 100%)';
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="absolute inset-0 rounded-full"
        style={{
          background: 'conic-gradient(from 210deg, #e9d5a0, #80663d 30%, #c8a45d 55%, #6b5430 80%, #e9d5a0)',
          boxShadow: active ? '0 0 0 1px rgba(226,201,143,0.6), 0 0 22px rgba(200,164,93,0.55)' : '0 6px 14px rgba(0,0,0,0.5)',
          transition: 'box-shadow 0.4s',
        }}
      />
      <div
        className="absolute rounded-full flex items-center justify-center text-gold-soft"
        style={{ inset: 2.5, background, boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.55), inset 0 -1px 0 rgba(255,255,255,0.08)' }}
      >
        {kind === 'strategist' && <ChessKnight size={size * 0.46} strokeWidth={1.4} />}
        {kind === 'maverick' && <Flame size={size * 0.46} strokeWidth={1.4} />}
        {kind === 'human' && (
          <span className="font-serif font-semibold leading-none" style={{ fontSize: size * 0.5 }}>
            {(name.trim()[0] ?? 'Y').toUpperCase()}
          </span>
        )}
      </div>
    </div>
  );
}

export function Modal({
  title,
  onClose,
  children,
  width = 560,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      className="absolute inset-0 z-[70] flex items-center justify-center bg-black/65 backdrop-blur-[3px]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel flex max-h-[86%] flex-col rounded-lg"
        style={{ width, maxWidth: '92%' }}
        initial={{ y: 18, opacity: 0, scale: 0.98 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        exit={{ y: 10, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      >
        <div className="flex items-center justify-between px-7 pt-6 pb-3">
          <h2 className="font-serif text-[28px] font-semibold leading-none tracking-wide text-gold-soft">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            className="-mr-2 rounded p-2 text-ivory/60 transition hover:bg-white/5 hover:text-ivory"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>
        <div className="gold-rule mx-7" />
        <div className="overflow-y-auto px-7 py-5 text-[13.5px] leading-relaxed text-ivory/80">{children}</div>
        {footer && <div className="flex justify-end gap-3 px-7 pb-6">{footer}</div>}
      </motion.div>
    </motion.div>
  );
}
