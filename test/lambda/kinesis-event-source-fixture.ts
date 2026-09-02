/**
 * The parts a Kinesis stream event source mapping test needs before it can say
 * anything about delivery: a stream, a role that may read it, a function to
 * deliver to, and the mapping between them.
 *
 * A sibling of the DynamoDB stream fixture rather than part of it: the
 * recording handler is shared from the queue fixture, and everything about
 * which source is being read differs.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  type EventSourcePosition,
} from "@aws-sdk/client-lambda";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../src/service/kinesis/stream/sim-kinesis-stream.factory.js";
import type { SimLambdaKinesisStreamEvent } from "../../src/service/lambda/event-source/poll/kinesis/sim-lambda-kinesis-stream-event.types.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";
import { recordingHandler } from "./event-source-fixture.js";

/**
 * The Kinesis operations real Lambda requires an execution role to be allowed
 * before it will create an event source mapping on a stream.
 */
export const kinesisPollingActions: readonly string[] = [
  "kinesis:DescribeStream",
  "kinesis:GetRecords",
  "kinesis:GetShardIterator",
];

/**
 * Make an execution role allowed to read a stream.
 *
 * `kinesis:ListStreams` is on every stream rather than on one, which is what
 * both the AWS managed policy and CDK's own grant do.
 */
export async function makeKinesisPollingRole(
  simAws: SimAws,
  streamArn: string,
  actions: readonly string[] = kinesisPollingActions,
): Promise<string> {
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderProjectorRole",
      AssumeRolePolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: {
          Effect: "Allow",
          Principal: { Service: "lambda.amazonaws.com" },
          Action: "sts:AssumeRole",
        },
      }),
    }),
  );

  await simAws.iam().putRolePolicy(
    new PutRolePolicyCommand({
      RoleName: "OrderProjectorRole",
      PolicyName: "ProjectOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          { Effect: "Allow", Action: actions, Resource: streamArn },
          { Effect: "Allow", Action: "kinesis:ListStreams", Resource: "*" },
          { Effect: "Allow", Action: "kinesis:PutRecord", Resource: "*" },
        ],
      }),
    }),
  );

  const roleArn = role.Role.Arn;
  assertNonNullable(roleArn, "CreateRole answered with a role ARN");

  return roleArn;
}

/**
 * One simulated AWS with a Kinesis stream delivering to a function.
 */
export interface SimKinesisEventSourceFixture {
  readonly simAws: SimAws;
  readonly streamName: string;
  readonly streamArn: string;
  readonly functionName: string;
  readonly roleArn: string;
  readonly events: SimLambdaKinesisStreamEvent[];
  readonly uuid: string;
}

interface KinesisEventSourceOptions {
  readonly simAws?: SimAws;
  readonly streamName?: string;
  readonly shardCount?: number;
  readonly roleActions?: readonly string[];
  readonly handlerResult?: (event: SimLambdaKinesisStreamEvent) => unknown;
  readonly batchSize?: number;
  readonly startingPosition?: EventSourcePosition;
  readonly startingPositionTimestamp?: Date;
  readonly functionResponseTypes?: readonly "ReportBatchItemFailures"[];
  readonly maximumRetryAttempts?: number;
  readonly maximumRecordAgeInSeconds?: number;
}

/**
 * Make a simulated AWS with a Kinesis stream, a projector function, and a
 * mapping from one to the other.
 */
export async function simAwsWithKinesisEventSource(
  options: KinesisEventSourceOptions = {},
): Promise<SimKinesisEventSourceFixture> {
  const simAws = options.simAws ?? new SimAws();
  const streamName = options.streamName ?? "orders";
  const stream = await simKinesisStreamFactory.make(
    {
      streamName,
      ...(options.shardCount !== undefined && {
        shardCount: options.shardCount,
      }),
    },
    simAws,
  );
  const roleArn = await makeKinesisPollingRole(
    simAws,
    stream.arn,
    options.roleActions,
  );
  const { handler, events } = recordingHandler<SimLambdaKinesisStreamEvent>(
    options.handlerResult,
  );
  const functionName = await makeProjectorFunction(simAws, roleArn, handler);

  const mapping = await simAws.lambda().createEventSourceMapping(
    new CreateEventSourceMappingCommand({
      EventSourceArn: stream.arn,
      FunctionName: functionName,
      StartingPosition: options.startingPosition ?? "TRIM_HORIZON",
      ...(options.startingPositionTimestamp !== undefined && {
        StartingPositionTimestamp: options.startingPositionTimestamp,
      }),
      ...(options.batchSize !== undefined && { BatchSize: options.batchSize }),
      ...(options.functionResponseTypes !== undefined && {
        FunctionResponseTypes: [...options.functionResponseTypes],
      }),
      ...(options.maximumRetryAttempts !== undefined && {
        MaximumRetryAttempts: options.maximumRetryAttempts,
      }),
      ...(options.maximumRecordAgeInSeconds !== undefined && {
        MaximumRecordAgeInSeconds: options.maximumRecordAgeInSeconds,
      }),
    }),
  );

  assertNonNullable(mapping.UUID, "The mapping has a UUID");

  return {
    simAws,
    streamName,
    streamArn: stream.arn,
    functionName,
    roleArn,
    events,
    uuid: mapping.UUID,
  };
}

/**
 * Make a function backed by a real in-process handler, so a test can watch what
 * the handler was given.
 */
async function makeProjectorFunction(
  simAws: SimAws,
  roleArn: string,
  handler: SimLambdaHandler,
): Promise<string> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "order-projector",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  return "order-projector";
}
