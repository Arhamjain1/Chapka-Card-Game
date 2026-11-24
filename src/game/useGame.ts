import { useSyncExternalStore } from 'react';
import { GameController, type GameState } from './controller.ts';

export const game = new GameController();

export function useGameState(): GameState {
  return useSyncExternalStore(game.subscribe, game.getState);
}
