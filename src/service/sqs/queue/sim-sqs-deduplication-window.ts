/**
 * How long a FIFO queue remembers a deduplication id: five minutes.
 */
const deduplicationIntervalMilliseconds = 5 * 60 * 1000;

/**
 * What a send that was accepted reported, which a duplicate of it reports
 * again.
 */
export interface SimSqsAcceptedSend {
  readonly messageId: string;
  readonly sequenceNumber?: string | undefined;
}

interface SimSqsRememberedSend {
  readonly send: SimSqsAcceptedSend;
  readonly expiresAt: number;
}

/**
 * The deduplication ids a FIFO queue has accepted in the last five minutes.
 *
 * A send carrying one of them is accepted and not delivered, and answered with
 * the message id of the send it duplicates. The id is remembered for the whole
 * interval whatever happens to the message, since real SQS keeps tracking it
 * after the message is received and deleted. The interval is measured on the
 * simulation's clock, so advancing simulated time past it lets the same id
 * through again.
 */
export class SimSqsDeduplicationWindow {
  private readonly remembered = new Map<string, SimSqsRememberedSend>();

  /**
   * The send an id was first accepted with, if that was in the last five
   * minutes.
   */
  duplicated(key: string, instant: Date): SimSqsAcceptedSend | undefined {
    const remembered = this.remembered.get(key);

    if (remembered === undefined || remembered.expiresAt <= instant.getTime()) {
      this.remembered.delete(key);

      return undefined;
    }

    return remembered.send;
  }

  /**
   * Remember a send accepted under an id, for the next five minutes, and
   * forget the ids whose five minutes are up.
   *
   * Forgetting here keeps the window to five minutes of sends, where an id
   * never sent again would otherwise be held for as long as the queue exists.
   */
  remember(key: string, send: SimSqsAcceptedSend, instant: Date): void {
    for (const [held, { expiresAt }] of this.remembered) {
      if (expiresAt <= instant.getTime()) {
        this.remembered.delete(held);
      }
    }

    this.remembered.set(key, {
      send,
      expiresAt: instant.getTime() + deduplicationIntervalMilliseconds,
    });
  }
}

/**
 * Where a FIFO queue's sequence numbers start. Real ones are twenty digits
 * long, so these are too.
 */
const firstSequenceNumber = 18_000_000_000_000_000_000n;

/**
 * The gap between one sequence number and the next. Real SQS documents its
 * sequence numbers as large and non-consecutive, so these are not consecutive
 * either, and a test cannot come to depend on them being so.
 */
const sequenceStep = 65_536n;

/**
 * The sequence numbers one FIFO queue hands out, each larger than the last.
 */
export class SimSqsSequenceNumbers {
  private last = firstSequenceNumber;

  /**
   * The next sequence number.
   */
  next(): string {
    this.last += sequenceStep;

    return this.last.toString();
  }
}
