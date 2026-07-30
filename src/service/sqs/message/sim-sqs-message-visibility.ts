import { assertDefined } from "../../../util/type-guard/defined.js";

const millisecondsPerSecond = 1000;

/**
 * Whether one message can be received, and when it next can be.
 *
 * This is held as the instant the message becomes receivable rather than as a
 * timer. That is what makes a visibility timeout something a test can advance the
 * simulation clock past: nothing has to fire for a message to come back, it
 * simply becomes visible again once simulated time reaches the instant it was
 * hidden until.
 *
 * A delay works the same way. A message sent with a delay is invisible from the
 * moment it arrives, and the only difference from an in-flight message is that it
 * has never been received.
 */
export class SimSqsMessageVisibility {
  private visibleFrom: Date;
  private receives = 0;
  private firstReceivedAt: Date | undefined;

  constructor(visibleFrom: Date) {
    this.visibleFrom = visibleFrom;
  }

  /**
   * How many times the message has been handed out and not deleted.
   */
  get receiveCount(): number {
    return this.receives;
  }

  /**
   * When the message was first handed out.
   *
   * Only a message being handed out reports its attributes, and handing one out
   * is what sets the first receive, so there is always one to report by then.
   */
  get firstReceived(): Date {
    assertDefined(
      this.firstReceivedAt,
      "A message reports its first receive once it has been received",
    );

    return this.firstReceivedAt;
  }

  /**
   * Whether the message can be received at an instant.
   */
  isVisibleAt(instant: Date): boolean {
    return this.visibleFrom.getTime() <= instant.getTime();
  }

  /**
   * Whether the message is still waiting out the delay it was sent with.
   */
  isDelayedAt(instant: Date): boolean {
    return this.receives === 0 && !this.isVisibleAt(instant);
  }

  /**
   * Whether the message is hidden by a visibility timeout, which SQS counts as
   * in flight.
   */
  isInFlightAt(instant: Date): boolean {
    return this.receives > 0 && !this.isVisibleAt(instant);
  }

  /**
   * Record a receive, and hide the message for its visibility timeout.
   */
  receiveAt(instant: Date, visibilityTimeoutSeconds: number): void {
    this.receives += 1;
    this.firstReceivedAt ??= instant;
    this.hideFor(instant, visibilityTimeoutSeconds);
  }

  /**
   * Hide the message for a visibility timeout starting at an instant.
   */
  hideFor(instant: Date, visibilityTimeoutSeconds: number): void {
    this.visibleFrom = new Date(
      instant.getTime() + visibilityTimeoutSeconds * millisecondsPerSecond,
    );
  }
}
