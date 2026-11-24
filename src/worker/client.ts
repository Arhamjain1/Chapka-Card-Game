import { arrange, samplesFor, type Personality } from '../engine/ai.ts';
import type { Card } from '../engine/cards.ts';
import { DEFAULT_SAMPLES, PRIOR_WEIGHT, mergeWinTables, splitSamples, type PlayerView } from '../engine/model.ts';
import type { WinTable } from '../engine/optimiser.ts';
import { mulberry32, randomSeed } from '../engine/rng.ts';
import type { WorkerRequest, WorkerResponse } from './optimiser.worker.ts';

export interface AiResult {
  sets: Card[][];
  discards: Card[];
  expected: number;
}

type Pending = { resolve: (win: WinTable) => void; reject: (error: Error) => void };

const POOL_SIZE = Math.max(1, Math.min(6, (navigator.hardwareConcurrency || 4) - 1));

/** Simulates opponent deals on a small pool of background threads, so the page never stalls. */
export class OptimiserClient {
  private workers: Worker[] = [];
  private nextId = 1;
  private nextWorker = 0;
  private readonly pending = new Map<number, Pending>();

  private worker(): Worker {
    if (this.workers.length === 0) {
      for (let i = 0; i < POOL_SIZE; i++) {
        const worker = new Worker(new URL('./optimiser.worker.ts', import.meta.url), { type: 'module' });
        worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          const entry = this.pending.get(event.data.id);
          if (!entry) return;
          this.pending.delete(event.data.id);
          if ('error' in event.data) entry.reject(new Error(event.data.error));
          else entry.resolve(event.data.win);
        };
        worker.onerror = (event) => {
          for (const entry of this.pending.values()) entry.reject(new Error(event.message || 'The optimiser stopped.'));
          this.pending.clear();
        };
        this.workers.push(worker);
      }
    }
    this.nextWorker = (this.nextWorker + 1) % this.workers.length;
    return this.workers[this.nextWorker];
  }

  private request(body: Omit<WorkerRequest, 'id'>): Promise<WinTable> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker().postMessage({ ...body, id });
    });
  }

  /** This player's win chances by round and strength, from `samples` simulated deals. */
  async winTable(view: PlayerView, samples = DEFAULT_SAMPLES): Promise<WinTable> {
    const parts = splitSamples(samples, POOL_SIZE);
    const tables = await Promise.all(
      parts.map((part) =>
        this.request({ view, samples: part, seed: randomSeed(), priorWeight: (PRIOR_WEIGHT * part) / samples }),
      ),
    );
    return mergeWinTables(tables, parts);
  }

  /** A computer player's discards and sets. */
  async decide(personality: Personality, view: PlayerView, samples = DEFAULT_SAMPLES): Promise<AiResult> {
    const win = await this.winTable(view, samplesFor(personality, samples));
    const { arrangement, expected } = arrange(personality, view.hand, win, mulberry32(randomSeed()));
    return { sets: arrangement.sets, discards: arrangement.discards, expected };
  }

  /** Drops any work in progress, for example when the player leaves the game. */
  reset(): void {
    for (const worker of this.workers) worker.terminate();
    this.workers = [];
    for (const entry of this.pending.values()) entry.reject(new Error('cancelled'));
    this.pending.clear();
  }
}
