/**
 * The parts a DynamoDB stream event source mapping test needs before it can say
 * anything about delivery: a streamed table, a role that may read its stream, a
 * function to deliver to, and the mapping between them.
 *
 * A sibling of the queue fixture rather than part of it: the recording handler
 * is shared from there, and everything else about a stream mapping differs.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
  type EventSourcePosition,
} from "@aws-sdk/client-lambda";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { simDynamoDbStreamedTableFactory } from "../../src/service/dynamodb/stream/sim-dynamodb-streamed-table.factory.js";
import type { SimDynamoDbStreamViewType } from "../../src/service/dynamodb/stream/sim-dynamodb-stream.types.js";
import type { SimLambdaDynamoDbStreamEvent } from "../../src/service/lambda/event-source/poll/sim-lambda-dynamodb-stream-event.types.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";
import { recordingHandler } from "./event-source-fixture.js";

/**
 * The DynamoDB Streams operations real Lambda requires an execution role to be
 * allowed before it will create an event source mapping on a stream.
 */
export const streamPollingActions: readonly string[] = [
  "dynamodb:DescribeStream",
  "dynamodb:GetRecords",
  "dynamodb:GetShardIterator",
];

/**
 * One simulated AWS with a streamed table on it.
 */
export interface SimDynamoDbSourceStream {
  readonly simAws: SimAws;
  readonly tableName: string;
  readonly streamArn: string;
}

interface SourceStreamOptions {
  readonly tableName?: string;
  readonly viewType?: SimDynamoDbStreamViewType;
}

/**
 * Make a table with a stream for an event source mapping to poll.
 */
export async function makeSourceStream(
  simAws: SimAws,
  options: SourceStreamOptions = {},
): Promise<SimDynamoDbSourceStream> {
  const tableName = options.tableName ?? "orders";
  const table = await simDynamoDbStreamedTableFactory.make(
    {
      tableName,
      ...(options.viewType !== undefined && { viewType: options.viewType }),
    },
    simAws,
  );
  const streamArn = table.stream.latest?.arn;

  assertNonNullable(streamArn, "The table has a stream ARN");

  return { simAws, tableName, streamArn };
}

/**
 * Make an execution role allowed to read a stream.
 *
 * `dynamodb:ListStreams` is on every stream rather than on one, which is what
 * both the AWS managed policy and CDK's own grant do.
 */
export async function makeStreamPollingRole(
  simAws: SimAws,
  streamArn: string,
  actions: readonly string[] = streamPollingActions,
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
          {
            Effect: "Allow",
            Action: "dynamodb:ListStreams",
            Resource: "*",
          },
          { Effect: "Allow", Action: "dynamodb:PutItem", Resource: "*" },
        ],
      }),
    }),
  );

  const roleArn = role.Role.Arn;
  assertNonNullable(roleArn, "CreateRole answered with a role ARN");

  return roleArn;
}

/**
 * One simulated AWS with a table's stream delivering to a function.
 */
export interface SimDynamoDbStreamEventSourceFixture extends SimDynamoDbSourceStream {
  readonly functionName: string;
  readonly roleArn: string;
  readonly events: SimLambdaDynamoDbStreamEvent[];
  readonly uuid: string;
}

interface StreamEventSourceOptions {
  readonly simAws?: SimAws;
  readonly tableName?: string;
  readonly viewType?: SimDynamoDbStreamViewType;
  readonly roleActions?: readonly string[];
  readonly handlerResult?: (event: SimLambdaDynamoDbStreamEvent) => unknown;
  readonly batchSize?: number;
  readonly startingPosition?: EventSourcePosition;
  readonly functionResponseTypes?: readonly "ReportBatchItemFailures"[];
  readonly maximumRetryAttempts?: number;
  readonly maximumRecordAgeInSeconds?: number;
}

/**
 * Make a simulated AWS with a streamed table, a projector function, and a
 * mapping from one to the other.
 */
export async function simAwsWithStreamEventSource(
  options: StreamEventSourceOptions = {},
): Promise<SimDynamoDbStreamEventSourceFixture> {
  const simAws = options.simAws ?? new SimAws();
  const stream = await makeSourceStream(simAws, {
    ...(options.tableName !== undefined && { tableName: options.tableName }),
    ...(options.viewType !== undefined && { viewType: options.viewType }),
  });
  const roleArn = await makeStreamPollingRole(
    simAws,
    stream.streamArn,
    options.roleActions,
  );
  const { handler, events } = recordingHandler<SimLambdaDynamoDbStreamEvent>(
    options.handlerResult,
  );
  const functionName = await makeProjectorFunction(simAws, roleArn, handler);

  const mapping = await simAws.lambda().createEventSourceMapping(
    new CreateEventSourceMappingCommand({
      EventSourceArn: stream.streamArn,
      FunctionName: functionName,
      StartingPosition: options.startingPosition ?? "TRIM_HORIZON",
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

  return { ...stream, functionName, roleArn, events, uuid: mapping.UUID };
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
