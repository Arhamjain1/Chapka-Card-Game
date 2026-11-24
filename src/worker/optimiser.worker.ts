import { estimateWinTable, type PlayerView } from '../engine/model.ts';
import { mulberry32 } from '../engine/rng.ts';

export interface WorkerRequest {
  id: number;
  view: PlayerView;
  samples: number;
  seed: number;
  priorWeight: number;
}

export type WorkerResponse = { id: number; win: Float32Array } | { id: number; error: string };

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: WorkerResponse): void;
};

scope.onmessage = (event) => {
  const { id, view, samples, seed, priorWeight } = event.data;
  try {
    scope.postMessage({ id, win: estimateWinTable(view, samples, mulberry32(seed), priorWeight) });
  } catch (error) {
    scope.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
