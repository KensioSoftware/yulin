import { SimLambdaEventSourceBatchRules } from "../sim-lambda-event-source-batch-rules.js";
import { SimLambdaEventSourcePollingPermission } from "../sim-lambda-event-source-polling-permission.js";
import { SimLambdaStreamRetryLimitRules } from "../sim-lambda-event-source-retry-limits.js";
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
const dynamoDbStreamPollingOperations = [
  "DescribeStream",
  "GetRecords",
  "GetShardIterator",
] as const;

/**
 * What an execution role has to be allowed before a mapping on one stream can
 * be created, as the permissions simulated IAM is asked for.
 */
export function dynamoDbStreamPollingPermissions(
  streamArn: string,
): readonly SimLambdaEventSourcePollingPermission[] {
  return [
    ...dynamoDbStreamPollingOperations.map(
      (operation) =>
        new SimLambdaEventSourcePollingPermission(
          `dynamodb:${operation}`,
          streamArn,
        ),
    ),
    new SimLambdaEventSourcePollingPermission("dynamodb:ListStreams", "*"),
  ];
}

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

/**
 * A DynamoDB stream mapping counts a failed batch's attempts itself, so it
 * takes both of Lambda's failed-batch limits.
 */
export const dynamoDbStreamRetryLimitRules =
  new SimLambdaStreamRetryLimitRules();
