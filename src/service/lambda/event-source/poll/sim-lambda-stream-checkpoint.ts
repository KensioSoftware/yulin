import type { SimLambdaEventSourceStartingPosition } from "../sim-lambda-event-source-starting-position.js";
import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";

/**
 * How far along its stream one mapping has got.
 *
 * This is the difference between a stream and a queue. A queue hands a message
 * out and hides it, so a failed batch is the queue's problem afterwards. A
 * stream hands out a place, and the reader is the only thing that remembers it,
 * so a batch that failed is read again from exactly where it was. The
 * checkpoint therefore only moves when a batch is finished with: handled, or
 * discarded after its retries.
 */
export class SimLambdaStreamCheckpoint {
  #position: SimLambdaEventSourceStreamPosition;

  constructor(startingPosition: SimLambdaEventSourceStartingPosition) {
    this.#position = { kind: "starting", startingPosition };
  }

  /**
   * Where the next read starts.
   */
  get position(): SimLambdaEventSourceStreamPosition {
    return this.#position;
  }

  /**
   * Move past a batch that is finished with.
   */
  advanceTo(position: SimLambdaEventSourceStreamPosition): void {
    this.#position = position;
  }

  /**
   * Take a batch the function did not finish.
   *
   * A batch that failed whole is read again from where it was. One the function
   * reported failing partway through moves the checkpoint to the record it
   * named, so that record and everything after it goes over again, including
   * the records after it that the function did handle. The records before it
   * are finished with.
   */
  retry(outcome: SimLambdaStreamBatchOutcome): void {
    this.#position = outcome.retryPosition(this.#position);
  }
}
