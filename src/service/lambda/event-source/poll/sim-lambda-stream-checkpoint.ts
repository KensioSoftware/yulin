import type { SimLambdaEventSourceStart } from "../sim-lambda-event-source-starting-position.js";
import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";

/**
 * How far along its stream one mapping has got.
 *
 * This is the difference between a stream and a queue. A queue hands a message
 * out and hides it, so a failed batch is the queue's problem afterwards. A
 * stream hands out a place, and the reader is the only thing that remembers it,
 * so a batch that failed is read again from exactly where it was.
 *
 * The place is all this holds. Which place the next read starts from is decided
 * by what became of the batch and what the mapping is willing to keep trying,
 * and that decision is made elsewhere.
 */
export class SimLambdaStreamCheckpoint {
  #position: SimLambdaEventSourceStreamPosition;

  constructor(start: SimLambdaEventSourceStart) {
    this.#position = { kind: "starting", start };
  }

  /**
   * Where the next read starts.
   */
  get position(): SimLambdaEventSourceStreamPosition {
    return this.#position;
  }

  /**
   * Move to where the next read starts.
   *
   * That is past a batch the mapping is finished with, and back to the record a
   * batch it is not finished with is delivered again from.
   */
  advanceTo(position: SimLambdaEventSourceStreamPosition): void {
    this.#position = position;
  }
}
