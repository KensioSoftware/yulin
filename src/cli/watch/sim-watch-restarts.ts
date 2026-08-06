interface SimWatchRestartsProperties {
  readonly restart: (changedPath: string) => Promise<void>;
  readonly onFailure: (error: unknown) => void;
}

/**
 * Runs restarts one at a time, and does not lose an edit made during one.
 *
 * Changes arrive whenever they arrive, and a restart takes as long as the
 * project takes to start. Running two at once would leave two processes racing
 * for the same port, and dropping the second would mean a save silently doing
 * nothing, so a change that arrives mid-restart waits for its turn.
 *
 * Only the latest is kept. A restart takes whatever is on disk at the time, so
 * two changes queued behind one restart are one restart.
 */
export class SimWatchRestarts {
  private readonly restart: (changedPath: string) => Promise<void>;
  private readonly onFailure: (error: unknown) => void;
  private running = false;
  private queuedPath: string | undefined;

  constructor(properties: SimWatchRestartsProperties) {
    const { restart, onFailure } = properties;
    this.restart = restart;
    this.onFailure = onFailure;
  }

  /**
   * Restart for a change, now or as soon as the current restart is done.
   */
  request(changedPath: string): void {
    if (this.running) {
      this.queuedPath = changedPath;
      return;
    }

    this.running = true;

    // eslint-disable-next-line unicorn/prefer-await
    this.run(changedPath).catch((error: unknown) => {
      this.onFailure(error);
    });
  }

  private async run(changedPath: string): Promise<void> {
    try {
      await this.restart(changedPath);
    } finally {
      this.running = false;
    }

    await this.drain();
  }

  private async drain(): Promise<void> {
    const queuedPath = this.queuedPath;
    this.queuedPath = undefined;

    if (queuedPath === undefined) {
      return;
    }

    this.running = true;

    await this.run(queuedPath);
  }
}
