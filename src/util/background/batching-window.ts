/**
 * The batching window of one consumer gathering records into a batch.
 *
 * The window opens when a poll first finds records and too few of them to fill
 * a batch. A partial batch waits until the window has run its length, and a
 * full one goes at once. Either way the window closes with the delivery, and
 * the next partial batch opens a new one.
 */
export class BatchingWindow {
  #closesAt: number | undefined;

  /**
   * Whether a poll that found some records holds them for the window,
   * arranging to look again when it closes, or sooner where more records are
   * known to arrive before then.
   */
  holds(
    now: Date,
    found: number,
    batching: {
      readonly batchSize: number;
      readonly batchingWindowSeconds?: number | undefined;
    },
    pollAt: (instant: Date) => void,
    sooner?: Date,
  ): boolean {
    const until = this.holdUntil(
      now,
      found,
      batching.batchSize,
      batching.batchingWindowSeconds ?? 0,
    );

    if (until !== undefined) {
      pollAt(sooner !== undefined && sooner < until ? sooner : until);
    }

    return until !== undefined;
  }

  /**
   * When a poll that found some records should look again, or nothing when it
   * should deliver what it found now.
   */
  holdUntil(
    now: Date,
    found: number,
    batchSize: number,
    windowSeconds: number,
  ): Date | undefined {
    if (windowSeconds === 0 || found === 0 || found >= batchSize) {
      this.#closesAt = undefined;

      return undefined;
    }

    this.#closesAt ??= now.getTime() + windowSeconds * 1000;

    if (now.getTime() >= this.#closesAt) {
      this.#closesAt = undefined;

      return undefined;
    }

    return new Date(this.#closesAt);
  }
}
