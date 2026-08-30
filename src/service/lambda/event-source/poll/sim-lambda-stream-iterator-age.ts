import type { SimLambdaFunction } from "../../function/sim-lambda-function.js";
import type { SimLambdaKinesisStreamRecord } from "../stream/kinesis/sim-lambda-kinesis-streams.js";
import type { SimLambdaEventSourceStreamRecord } from "../stream/sim-lambda-event-source-streams.js";

/**
 * Count what a finished DynamoDB Streams batch left on the clock.
 */
export function countSimLambdaDynamoDbIteratorAge(
  simFunction: SimLambdaFunction,
  records: readonly SimLambdaEventSourceStreamRecord[],
): void {
  simFunction.metrics.iteratorAge.count(
    simFunction.name,
    newestOf(records.map((one) => one.dynamodb?.ApproximateCreationDateTime)),
  );
}

/**
 * Count what a finished Kinesis batch left on the clock.
 */
export function countSimLambdaKinesisIteratorAge(
  simFunction: SimLambdaFunction,
  records: readonly SimLambdaKinesisStreamRecord[],
): void {
  simFunction.metrics.iteratorAge.count(
    simFunction.name,
    newestOf(records.map((one) => one.ApproximateArrivalTimestamp)),
  );
}

/**
 * The latest of the times given, if any of them is a time.
 *
 * This is what `IteratorAge` is measured back from. Records reach a poller in
 * stream order, and the whole batch is read anyway because a record carrying
 * no time would otherwise decide the answer by where it sits.
 *
 * A batch whose records all arrive without a time has no answer, and the
 * metric is left uncounted rather than measured from nothing.
 */
function newestOf(times: readonly (Date | undefined)[]): Date | undefined {
  let newest: Date | undefined;

  for (const time of times) {
    if (time !== undefined && (newest === undefined || time > newest)) {
      newest = time;
    }
  }

  return newest;
}
