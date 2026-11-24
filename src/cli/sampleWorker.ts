import { parentPort } from 'node:worker_threads';
import { estimateWinTable, type PlayerView } from '../engine/model.ts';
import { mulberry32 } from '../engine/rng.ts';

export interface SampleRequest {
  id: number;
  view: PlayerView;
  samples: number;
  seed: number;
  priorWeight: number;
}

export interface SampleResponse {
  id: number;
  win: Float32Array;
}

parentPort!.on('message', ({ id, view, samples, seed, priorWeight }: SampleRequest) => {
  const response: SampleResponse = { id, win: estimateWinTable(view, samples, mulberry32(seed), priorWeight) };
  parentPort!.postMessage(response);
});
