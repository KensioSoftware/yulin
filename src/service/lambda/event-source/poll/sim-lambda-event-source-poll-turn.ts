/**
 * What a turn is taken on behalf of.
 */
export interface SimLambdaEventSourcePolls {
  /**
   * Poll once.
   */
  poll(): Promise<void>;

  /**
   * Poll again as soon as the simulation gets to it.
   */
  pollNow(): void;
}

/**
 * One poll at a time, remembering a wake-up that arrived during one.
 *
 * A stream mapping cannot have two polls overlapping. Reading a stream record
 * leaves it where it is, unlike receiving a message, so a second poll reading
 * from the same checkpoint would hand the same records to the function again.
 *
 * Dropping the second poll instead is not safe either. The poll schedule clears
 * its own flag when the task starts rather than when it finishes, so a write
 * landing mid-poll does schedule a further poll, and a poll that returned
 * without noting it would leave those records sitting until an unrelated later
 * write happened to wake the mapping.
 */
export class SimLambdaEventSourcePollTurn {
  private readonly poller: SimLambdaEventSourcePolls;
  private running = false;
  private asked = false;

  constructor(poller: SimLambdaEventSourcePolls) {
    this.poller = poller;
  }

  /**
   * Take a turn, or note that one was asked for while a turn is being taken.
   *
   * The poll asked for during a turn is scheduled once the turn is over rather
   * than run here, so the two never overlap.
   */
  async take(): Promise<void> {
    if (this.running) {
      this.asked = true;

      return;
    }

    this.running = true;

    try {
      await this.poller.poll();
    } finally {
      this.running = false;

      if (this.asked) {
        this.asked = false;
        this.poller.pollNow();
      }
    }
  }
}
