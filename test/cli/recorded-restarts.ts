import { SimWatchRestarts } from "../../src/cli/watch/sim-watch-restarts.js";

interface RecordedRestartsProperties {
  readonly failWith?: Error;
}

/**
 * A restart runner whose restarts finish when the test says so, so the queueing
 * can be driven a step at a time.
 */
export class RecordedRestarts {
  readonly restarted: string[] = [];
  readonly failures: string[] = [];

  private readonly restarts: SimWatchRestarts;
  private finishRestart: (() => void) | undefined;
  private failWith: Error | undefined;

  constructor(properties: RecordedRestartsProperties = {}) {
    this.failWith = properties.failWith;
    this.restarts = new SimWatchRestarts({
      restart: async (changedPath: string): Promise<void> => {
        await new Promise<void>((resolve) => {
          this.finishRestart = resolve;
        });

        this.restarted.push(changedPath);

        if (this.failWith !== undefined) {
          throw this.failWith;
        }
      },
      onFailure: (error: unknown): void => {
        this.failures.push(error instanceof Error ? error.message : "");
      },
    });
  }

  /**
   * Ask for a restart, as a settled change does.
   */
  request(changedPath: string): void {
    this.restarts.request(changedPath);
  }

  /**
   * Let the restart that is waiting finish.
   */
  release(): void {
    this.finishRestart?.();
    this.finishRestart = undefined;
  }

  /**
   * Have the next restart succeed.
   */
  stopFailing(): void {
    this.failWith = undefined;
  }

  /**
   * Let the promises that were waiting run.
   */
  async settle(): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}
