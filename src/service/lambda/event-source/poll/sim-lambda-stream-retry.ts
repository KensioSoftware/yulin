import type { SimLambdaStreamDiscard } from "./sim-lambda-stream-failure-record.js";
import type { SimClock } from "../../../../util/clock/sim-clock.js";
import type { SimLambdaStreamRetryLimits } from "../sim-lambda-stream-retry-limits.js";
import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";
import { SimLambdaStreamRetryBackoff } from "./sim-lambda-stream-retry-backoff.js";

/**
 * One more delivery of a failed batch: where it starts, and how long the
 * mapping waits first.
 */
export interface SimLambdaStreamRetryAttempt {
  readonly position: SimLambdaEventSourceStreamPosition;
  readonly afterSeconds: number;
}

/** Tracks the retry quota and checkpoint of one failed stream batch. */
export class SimLambdaStreamRetry {
  public discarded: SimLambdaStreamDiscard | undefined;
  private readonly clock: SimClock;
  private readonly backoff: SimLambdaStreamRetryBackoff;

  constructor(limits: SimLambdaStreamRetryLimits, clock: SimClock) {
    this.clock = clock;
    this.backoff = new SimLambdaStreamRetryBackoff(limits.attemptLimit);
  }

  /**
   * The next delivery of a failed batch, or nothing when the batch is finished
   * with.
   */
  after(
    outcome: SimLambdaStreamBatchOutcome,
    readFrom: SimLambdaEventSourceStreamPosition,
  ): SimLambdaStreamRetryAttempt | undefined {
    this.discarded = undefined;
    if (this.backoff.isExhausted) {
      this.discarded = {
        records: outcome.records.slice(outcome.retryIndex),
        condition: "RetryAttemptsExhausted",
        at: this.clock.now(),
      };
      return undefined;
    }

    const afterSeconds = this.backoff.nextSeconds();
    return { position: outcome.retryPosition(readFrom), afterSeconds };
  }

  /**
   * Start counting again, which a batch that is finished with does.
   */
  reset(): void {
    this.backoff.reset();
  }
}
