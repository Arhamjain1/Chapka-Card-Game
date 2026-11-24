import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, LayoutGroup, MotionConfig } from 'framer-motion';
import { game, useGameState } from './game/useGame.ts';
import { CardLayer } from './ui/CardLayer.tsx';
import { CentreStage } from './ui/CentreStage.tsx';
import { HumanControls, SlotTrays } from './ui/HumanControls.tsx';
import { computeGeometry } from './ui/layout.ts';
import { OptimiserScreen } from './ui/OptimiserScreen.tsx';
import { ExitModal, Lobby, Results, RulesModal, SettingsModal } from './ui/Overlays.tsx';
import { Seats } from './ui/Seats.tsx';
import { Table } from './ui/Table.tsx';
import { TopBar } from './ui/TopBar.tsx';

type ModalName = 'rules' | 'settings' | 'exit' | 'optimiser' | null;

function useViewport(): { width: number; height: number } {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const onResize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return size;
}

export function App() {
  const state = useGameState();
  const viewport = useViewport();
  const geometry = useMemo(() => computeGeometry(viewport.width, viewport.height), [viewport]);
  const [modal, setModal] = useState<ModalName>(null);
  const closeModal = useCallback(() => setModal(null), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.code !== 'Space' || modal !== null) return;
      const element = event.target as HTMLElement | null;
      if (element && ['INPUT', 'TEXTAREA', 'BUTTON'].includes(element.tagName)) return;
      if (element?.getAttribute('role') === 'button') return;
      if (game.getState().awaitingAdvance) {
        event.preventDefault();
        game.advance();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal]);

  const inGame = state.phase !== 'lobby';

  return (
    <MotionConfig reducedMotion="user">
      <div className="h-full w-full overflow-auto">
        <div className="room relative overflow-hidden" style={{ width: geometry.width, height: geometry.height }}>
          <Table g={geometry} moving={inGame && state.phase !== 'results' && modal === null} lively={state.phase === 'play'} />
          {inGame && (
            <LayoutGroup>
              <Seats state={state} g={geometry} />
            </LayoutGroup>
          )}
          <SlotTrays state={state} g={geometry} />
          <CardLayer state={state} geometry={geometry} />
          {inGame && <CentreStage state={state} g={geometry} />}
          {inGame && <HumanControls state={state} g={geometry} />}
          <TopBar state={state} compact={inGame && geometry.width < 1240} onOptimiser={() => setModal('optimiser')} onRules={() => setModal('rules')} onSettings={() => setModal('settings')} onExit={() => setModal('exit')} />

          <AnimatePresence>{state.phase === 'lobby' && <Lobby key="lobby" onRules={() => setModal('rules')} onOptimiser={() => setModal('optimiser')} />}</AnimatePresence>
          <AnimatePresence>{state.phase === 'results' && <Results key="results" state={state} />}</AnimatePresence>
          <AnimatePresence>
            {modal === 'rules' && <RulesModal key="rules" onClose={closeModal} />}
            {modal === 'settings' && <SettingsModal key="settings" state={state} onClose={closeModal} />}
            {modal === 'exit' && <ExitModal key="exit" onClose={closeModal} />}
            {modal === 'optimiser' && <OptimiserScreen key="optimiser" onClose={closeModal} />}
          </AnimatePresence>
        </div>
      </div>
    </MotionConfig>
  );
}
