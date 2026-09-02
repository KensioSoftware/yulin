import { SimLambdaEventSourceBatchRules } from "../../sim-lambda-event-source-batch-rules.js";
import { SimLambdaStreamRetryLimitRules } from "../../sim-lambda-event-source-retry-limits.js";
import { SimLambdaStreamStartingPosition } from "../../sim-lambda-event-source-starting-position.js";

/**
 * What a function's execution role has to be allowed to do on a stream for
 * Lambda to poll it.
 *
 * These are the three operations a poller performs on the stream itself.
 * `ListStreams` goes with them, on every stream rather than on one: nothing
 * here ever calls it, and both the AWS managed policy and CDK's own grant
 * include it, so a role that would work on AWS is a role that works here.
 */
export const kinesisStreamPollingOperations = [
  "DescribeStream",
  "GetRecords",
  "GetShardIterator",
] as const;

/**
 * The batch sizes a Kinesis stream event source delivers with.
 *
 * A hundred is what real Lambda uses when the mapping names none, and what CDK
 * puts on every `KinesisEventSource`. Ten thousand is the largest a mapping may
 * ask for, which is also the most one GetRecords call hands back.
 */
export const kinesisStreamBatchRules = new SimLambdaEventSourceBatchRules({
  defaultSize: 100,
  maximumSize: 10_000,
  sourceDescription: "a Kinesis stream",
  unitName: "records",
});

/**
 * A stream mapping has to say where it starts reading from.
 *
 * A Kinesis stream takes all three positions, unlike a DynamoDB stream, since
 * its records carry the instant they arrived.
 */
export const kinesisStreamStartingPositionRules =
  new SimLambdaStreamStartingPosition({
    positions: ["TRIM_HORIZON", "LATEST", "AT_TIMESTAMP"],
    sourceDescription: "a Kinesis stream",
  });

/**
 * A Kinesis stream mapping counts a failed batch's attempts itself, so it takes
 * both of Lambda's failed-batch limits.
 */
export const kinesisStreamRetryLimitRules =
  new SimLambdaStreamRetryLimitRules();
