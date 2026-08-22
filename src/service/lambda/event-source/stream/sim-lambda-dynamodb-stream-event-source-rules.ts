import { SimLambdaEventSourceBatchRules } from "../sim-lambda-event-source-batch-rules.js";
import { SimLambdaStreamStartingPosition } from "../sim-lambda-event-source-starting-position.js";

/**
 * What a function's execution role has to be allowed to do on a stream for
 * Lambda to poll it.
 *
 * These are the three operations a poller performs on the stream itself.
 * `ListStreams` goes with them, on every stream rather than on one: nothing
 * here ever calls it, but both the AWS managed policy and CDK's own grant
 * include it, so a role that would work on AWS is a role that works here.
 */
export const dynamoDbStreamPollingOperations = [
  "DescribeStream",
  "GetRecords",
  "GetShardIterator",
] as const;

/**
 * The batch sizes a DynamoDB stream event source delivers with.
 *
 * A hundred is what real Lambda uses when the mapping names none, and what CDK
 * puts on every `DynamoEventSource`. Ten thousand is the largest a mapping may
 * ask for.
 */
export const dynamoDbStreamBatchRules = new SimLambdaEventSourceBatchRules({
  defaultSize: 100,
  maximumSize: 10_000,
  sourceDescription: "a DynamoDB stream",
  unitName: "records",
});

/**
 * A stream mapping has to say where it starts reading from.
 *
 * A DynamoDB stream takes two of the three positions. `AT_TIMESTAMP` is for a
 * Kinesis stream, and real Lambda refuses it here.
 */
export const dynamoDbStreamStartingPositionRules =
  new SimLambdaStreamStartingPosition({
    positions: ["TRIM_HORIZON", "LATEST"],
    sourceDescription: "a DynamoDB stream",
    positionElsewhere: "AT_TIMESTAMP is for a Kinesis stream",
  });
