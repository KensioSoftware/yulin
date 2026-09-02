import { setTimeout } from "node:timers";

/**
 * A short random pause between scheduling a task and running it.
 *
 * This is what makes a non-deterministic scheduler non-deterministic: real
 * distributed operations do not finish in the order they were started, and
 * jitter is how that gets simulated.
 */
export class BackgroundJitter {
  private readonly maxMs: number;

  constructor(maxMs = 5) {
    this.maxMs = maxMs;
  }

  /**
   * Wait for somewhere between no time at all and the maximum jitter.
   */
  async wait(): Promise<void> {
    const milliseconds = Math.random() * this.maxMs;

    await new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    });
  }
}
