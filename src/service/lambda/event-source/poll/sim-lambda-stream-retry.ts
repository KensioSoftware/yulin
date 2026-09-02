import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimLambdaStreamRetryLimits } from "../sim-lambda-stream-retry-limits.js";
import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";
import { SimLambdaStreamRetryBackoff } from "./sim-lambda-stream-retry-backoff.js";

const millisecondsPerSecond = 1000;

interface SimLambdaStreamRetryProperties {
  readonly limits: SimLambdaStreamRetryLimits;
  readonly clock: SimClock;
}

/**
 * One more delivery of a failed batch: where it starts, and how long the
 * mapping waits first.
 */
export interface SimLambdaStreamRetryAttempt {
  readonly position: SimLambdaEventSourceStreamPosition;
  readonly afterSeconds: number;
}

/**
 * Whether a failed batch is handed over again, and from which record.
 *
 * Both of Lambda's failed-batch limits end here because they end the same
 * thing. A batch stops being delivered when it has had its retries, and a
 * record stops being delivered when it is older than the mapping will carry;
 * whichever comes first, what is left of the batch is discarded and the mapping
 * reads on. Records age out of the front of a batch, because a batch is in
 * stream order, so the answer is one record to start from rather than a list of
 * survivors.
 *
 * Ages are read at the instant the next delivery falls due rather than now,
 * because the wait before it is what ages the records out. A record judged now
 * would be handed to the function and only then found to be too old.
 */
export class SimLambdaStreamRetry {
  private readonly limits: SimLambdaStreamRetryLimits;
  private readonly clock: SimClock;
  private readonly backoff: SimLambdaStreamRetryBackoff;

  constructor(properties: SimLambdaStreamRetryProperties) {
    this.limits = properties.limits;
    this.clock = properties.clock;
    this.backoff = new SimLambdaStreamRetryBackoff(
      properties.limits.attemptLimit,
    );
  }

  /**
   * The next delivery of a failed batch, or nothing when the batch is finished
   * with.
   */
  after(
    outcome: SimLambdaStreamBatchOutcome,
    readFrom: SimLambdaEventSourceStreamPosition,
  ): SimLambdaStreamRetryAttempt | undefined {
    if (this.backoff.isExhausted) {
      return undefined;
    }

    const afterSeconds = this.backoff.nextSeconds();
    const deliveryAt = this.deliveryAt(afterSeconds);
    const position = this.retryPosition(outcome, readFrom, deliveryAt);

    if (position === undefined) {
      return undefined;
    }

    return { position, afterSeconds };
  }

  /**
   * Start counting again, which a batch that is finished with does.
   */
  reset(): void {
    this.backoff.reset();
  }

  /**
   * Where the next delivery starts, or nothing when every record left in the
   * batch has aged out.
   */
  private retryPosition(
    outcome: SimLambdaStreamBatchOutcome,
    readFrom: SimLambdaEventSourceStreamPosition,
    deliveryAt: Date,
  ): SimLambdaEventSourceStreamPosition | undefined {
    const { records, retryIndex } = outcome;
    const live = this.firstLiveIndex(records, retryIndex, deliveryAt);

    if (live === undefined) {
      return undefined;
    }

    const sequenceNumber = records.at(live)?.sequenceNumber;

    // Nothing aged out of the front, so the batch goes back exactly where the
    // report left it. A record that aged out but cannot be named leaves the
    // batch where it was too, since skipping past a record the mapping cannot
    // name would skip the records after it as well.
    if (live === retryIndex || sequenceNumber === undefined) {
      return outcome.retryPosition(readFrom);
    }

    return { kind: "sequence", sequenceNumber };
  }

  /**
   * The first record from `from` on that is still young enough to deliver.
   */
  private firstLiveIndex(
    records: readonly SimLambdaStreamRecordTime[],
    from: number,
    deliveryAt: Date,
  ): number | undefined {
    const index = records.findIndex(
      (record, position) =>
        position >= from && !this.limits.hasAgedOut(record.at, deliveryAt),
    );

    return index === -1 ? undefined : index;
  }

  /**
   * When the next delivery falls due, which is what a record's age is judged
   * against.
   *
   * Judging it now would hand a record over and only then notice that it was
   * too old to be worth handing over, since the wait is what makes it too old.
   */
  private deliveryAt(afterSeconds: number): Date {
    return new Date(
      this.clock.now().getTime() + afterSeconds * millisecondsPerSecond,
    );
  }
}
