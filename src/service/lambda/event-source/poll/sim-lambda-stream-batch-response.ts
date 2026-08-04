import type { SimLambdaEventSourceStreamRecord } from "../stream/sim-lambda-event-source-streams.js";
import { SimLambdaBatchItemFailures } from "./sim-lambda-batch-item-failures.js";
import { SimLambdaStreamBatchOutcome } from "./sim-lambda-stream-batch-outcome.js";

/**
 * Reads what a function said about the batch of stream records it was given.
 *
 * A sibling of the queue's batch response rather than a variation on it, and
 * the rule is the one AWS states for a stream: the lowest sequence number the
 * report names becomes the checkpoint, and everything from there is delivered
 * again. Records after it that the function did handle are delivered again too,
 * which is why a stream consumer has to be idempotent.
 *
 * A report naming a record that was not in the batch returns the whole batch,
 * as it does for a queue: the alternative is to guess which record was meant,
 * and guessing wrong on a stream skips records rather than repeating them.
 */
export class SimLambdaStreamBatchResponse {
  private readonly batchItemFailures: SimLambdaBatchItemFailures;

  constructor(reportsBatchItemFailures: boolean) {
    this.batchItemFailures = new SimLambdaBatchItemFailures(
      reportsBatchItemFailures,
    );
  }

  /**
   * What became of a batch the function returned from.
   */
  handled(
    records: readonly SimLambdaEventSourceStreamRecord[],
    result: unknown,
  ): SimLambdaStreamBatchOutcome {
    const failedIds = this.batchItemFailures.idsIn(result);

    if (failedIds === undefined) {
      return SimLambdaStreamBatchOutcome.handled();
    }

    const rewindTo = rewindPoint(failedIds, sequenceNumbersOf(records));

    if (rewindTo === undefined) {
      return this.failed();
    }

    return SimLambdaStreamBatchOutcome.failedFrom(rewindTo);
  }

  /**
   * What becomes of a batch the function threw on: the whole of it is read
   * again.
   */
  failed(): SimLambdaStreamBatchOutcome {
    return SimLambdaStreamBatchOutcome.failed();
  }
}

/**
 * The sequence numbers a batch's records can be named by, in stream order.
 *
 * A record carrying none is left out rather than given an empty name, so a
 * report entry with no identifier names nothing and the whole batch goes back.
 */
function sequenceNumbersOf(
  records: readonly SimLambdaEventSourceStreamRecord[],
): readonly string[] {
  return records.flatMap((record) => {
    const sequenceNumber = record.dynamodb?.SequenceNumber;

    if (sequenceNumber === undefined || sequenceNumber === "") {
      return [];
    }

    return [sequenceNumber];
  });
}

/**
 * The record a report sends the mapping back to, or undefined for a report it
 * cannot be trusted.
 *
 * The batch is in stream order, so the first record the report names is the
 * lowest sequence number it named.
 */
function rewindPoint(
  failedIds: readonly string[],
  sequenceNumbers: readonly string[],
): string | undefined {
  if (failedIds.some((failedId) => !sequenceNumbers.includes(failedId))) {
    return undefined;
  }

  return sequenceNumbers.find((sequenceNumber) =>
    failedIds.includes(sequenceNumber),
  );
}
