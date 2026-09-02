import type { SimLambdaKinesisStreamRecord } from "../stream/kinesis/sim-lambda-kinesis-streams.js";
import type { SimLambdaEventSourceStreamRecord } from "../stream/sim-lambda-event-source-streams.js";

/**
 * One record of a delivered batch, as deciding what to do with a failed batch
 * sees it.
 *
 * Two things about a record matter once its function has failed: the name the
 * mapping can be sent back to, and the instant its age is measured from. Each
 * stream service cuts both out of its own record shape, the way it already does
 * for the sequence numbers a batch item failure report names.
 */
export interface SimLambdaStreamRecordTime {
  readonly sequenceNumber: string | undefined;
  readonly at: Date | undefined;
}

/**
 * What a DynamoDB Streams batch's records are named by and dated from.
 */
export function simLambdaDynamoDbStreamRecordTimes(
  records: readonly SimLambdaEventSourceStreamRecord[],
): readonly SimLambdaStreamRecordTime[] {
  return records.map((one) => ({
    sequenceNumber: one.dynamodb?.SequenceNumber,
    at: one.dynamodb?.ApproximateCreationDateTime,
  }));
}

/**
 * What a Kinesis batch's records are named by and dated from.
 */
export function simLambdaKinesisStreamRecordTimes(
  records: readonly SimLambdaKinesisStreamRecord[],
): readonly SimLambdaStreamRecordTime[] {
  return records.map((one) => ({
    sequenceNumber: one.SequenceNumber,
    at: one.ApproximateArrivalTimestamp,
  }));
}
