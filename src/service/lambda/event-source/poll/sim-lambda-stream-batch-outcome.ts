import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";

/**
 * What became of one batch of stream records handed to a function.
 *
 * A queue batch splits into the messages that were handled and the ones that
 * go back, because each message is deleted or returned on its own. A stream
 * batch does not split. The mapping holds one place on the shard, so the answer
 * is one place: either the batch is finished with, or reading goes back to a
 * record and everything from there is delivered again.
 */
export class SimLambdaStreamBatchOutcome {
  public readonly isHandled: boolean;

  private readonly rewindTo: string | undefined;

  private constructor(isHandled: boolean, rewindTo: string | undefined) {
    this.isHandled = isHandled;
    this.rewindTo = rewindTo;
  }

  /**
   * A batch the function took in full.
   */
  static handled(): SimLambdaStreamBatchOutcome {
    return new SimLambdaStreamBatchOutcome(true, undefined);
  }

  /**
   * A batch the function did not take, which is read again from where it was.
   */
  static failed(): SimLambdaStreamBatchOutcome {
    return new SimLambdaStreamBatchOutcome(false, undefined);
  }

  /**
   * A batch the function reported failing partway through, which is read again
   * from the record it named.
   */
  static failedFrom(sequenceNumber: string): SimLambdaStreamBatchOutcome {
    return new SimLambdaStreamBatchOutcome(false, sequenceNumber);
  }

  /**
   * Where the next read starts when the batch goes back.
   *
   * A batch that failed whole goes back to where it was read from, which is the
   * place handed in. One the function reported on goes back to the record it
   * named, which may be behind or ahead of that place.
   */
  retryPosition(
    readFrom: SimLambdaEventSourceStreamPosition,
  ): SimLambdaEventSourceStreamPosition {
    const sequenceNumber = this.rewindTo;

    if (sequenceNumber === undefined) {
      return readFrom;
    }

    return { kind: "sequence", sequenceNumber };
  }
}
