import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import { PRIOR_WEIGHT, mergeWinTables, splitSamples, type PlayerView } from '../engine/model.ts';
import type { WinTable } from '../engine/optimiser.ts';
import type { SampleRequest, SampleResponse } from './sampleWorker.ts';

/** Runs the opponent simulation on several threads so an answer arrives in a fraction of a second. */
export class SamplePool {
  private readonly workers: Worker[];
  private readonly waiting = new Map<number, (win: WinTable) => void>();
  private nextId = 1;

  constructor(threads = Math.max(1, Math.min(8, availableParallelism() - 1))) {
    this.workers = Array.from({ length: threads }, () => {
      const worker = new Worker(new URL('./sampleWorker.ts', import.meta.url));
      worker.on('message', ({ id, win }: SampleResponse) => {
        this.waiting.get(id)?.(win);
        this.waiting.delete(id);
      });
      worker.on('error', (error: Error) => {
        console.error(`The optimiser stopped: ${error.message}`);
        process.exit(1);
      });
      return worker;
    });
  }

  get threads(): number {
    return this.workers.length;
  }

  async winTable(view: PlayerView, samples: number, seed: number): Promise<WinTable> {
    const parts = splitSamples(samples, this.workers.length);
    const tables = await Promise.all(
      parts.map(
        (part, i) =>
          new Promise<WinTable>((resolve) => {
            const request: SampleRequest = {
              id: this.nextId++,
              view,
              samples: part,
              seed: (seed + i * 0x9e3779b9) >>> 0,
              priorWeight: (PRIOR_WEIGHT * part) / samples,
            };
            this.waiting.set(request.id, resolve);
            this.workers[i].postMessage(request);
          }),
      ),
    );
    return mergeWinTables(tables, parts);
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((worker) => worker.terminate()));
  }
}
