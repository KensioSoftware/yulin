import type { SimLambdaEventSourceStreamPosition } from "../stream/sim-lambda-event-source-streams.js";
import type { SimLambdaStreamRecordTime } from "./sim-lambda-stream-record-times.js";

interface SimLambdaStreamBatchOutcomeProperties {
  readonly isHandled: boolean;
  readonly records: readonly SimLambdaStreamRecordTime[];
  readonly functionError?: boolean;
  readonly rewindTo?: string | undefined;
}

/**
 * What became of one batch of stream records handed to a function.
 *
 * A queue batch splits into the messages that were handled and the ones that
 * go back, because each message is deleted or returned on its own. A stream
 * batch does not split. The mapping holds one place on the shard, so the answer
 * is one place: either the batch is finished with, or reading goes back to a
 * record and everything from there is delivered again.
 *
 * The batch's own records travel with the answer, because what happens to a
 * batch that failed depends on them: they carry the names it can be sent back
 * to and the instants its records are aged from.
 */
export class SimLambdaStreamBatchOutcome {
  public readonly functionError: boolean;
  public readonly isHandled: boolean;

  /**
   * The records the batch carried, in stream order.
   */
  public readonly records: readonly SimLambdaStreamRecordTime[];

  private readonly rewindTo: string | undefined;

  private constructor(properties: SimLambdaStreamBatchOutcomeProperties) {
    this.functionError = properties.functionError ?? false;
    this.isHandled = properties.isHandled;
    this.records = properties.records;
    this.rewindTo = properties.rewindTo;
  }

  /**
   * A batch the function took in full.
   */
  static handled(
    records: readonly SimLambdaStreamRecordTime[],
  ): SimLambdaStreamBatchOutcome {
    return new SimLambdaStreamBatchOutcome({ isHandled: true, records });
  }

  /**
   * A batch the function did not take, which is read again from where it was.
   */
  static failed(
    records: readonly SimLambdaStreamRecordTime[],
  ): SimLambdaStreamBatchOutcome {
    return new SimLambdaStreamBatchOutcome({
      isHandled: false,
      records,
      functionError: true,
    });
  }

  /**
   * A batch the function reported failing partway through, which is read again
   * from the record it named.
   */
  static failedFrom(
    records: readonly SimLambdaStreamRecordTime[],
    sequenceNumber: string,
  ): SimLambdaStreamBatchOutcome {
    return new SimLambdaStreamBatchOutcome({
      isHandled: false,
      records,
      rewindTo: sequenceNumber,
    });
  }

  /**
   * Where in the batch the next delivery starts, as a position in the records
   * the batch carried.
   *
   * A batch that failed whole starts at the first record. One the function
   * reported on starts at the record it named, which the batch response has
   * already checked was in the batch, so a name that is not there is the whole
   * batch again rather than a guess.
   */
  get retryIndex(): number {
    const sequenceNumber = this.rewindTo;

    if (sequenceNumber === undefined) {
      return 0;
    }

    const index = this.records.findIndex(
      (record) => record.sequenceNumber === sequenceNumber,
    );

    return index === -1 ? 0 : index;
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
