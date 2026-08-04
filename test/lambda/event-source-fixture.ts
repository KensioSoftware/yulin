/**
 * The parts an event source mapping test needs before it can say anything about
 * delivery: a queue, a role that may poll it, a function to deliver to, and the
 * mapping between them.
 *
 * These live under `test/` for the same reason as the SQS queue fixture: eslint
 * rejects a test file exporting helpers alongside its own `describe` calls.
 */

import { CreateRoleCommand, PutRolePolicyCommand } from "@aws-sdk/client-iam";
import {
  CreateEventSourceMappingCommand,
  CreateFunctionCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand } from "@aws-sdk/client-sqs";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimLambdaSqsEvent } from "../../src/service/lambda/event-source/poll/sim-lambda-sqs-event.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/function/code/lambda-zip-file-input.js";
import type { SimLambdaHandler } from "../../src/service/lambda/function/sim-lambda-handler.type.js";

/**
 * The SQS operations real Lambda requires an execution role to be allowed
 * before it will create an event source mapping.
 */
export const sqsPollingActions: readonly string[] = [
  "sqs:ReceiveMessage",
  "sqs:DeleteMessage",
  "sqs:GetQueueAttributes",
];

/**
 * One simulated AWS with a queue on it.
 */
export interface SimSqsSourceQueue {
  readonly simAws: SimAws;
  readonly queueUrl: string;
  readonly queueArn: string;
}

/**
 * Make a queue named `orders` for an event source mapping to poll.
 */
export async function makeSourceQueue(
  simAws: SimAws,
  attributes?: Record<string, string>,
): Promise<SimSqsSourceQueue> {
  const created = await simAws.sqs().createQueue(
    new CreateQueueCommand({
      QueueName: "orders",
      ...(attributes !== undefined && { Attributes: attributes }),
    }),
  );
  const queueArn = simAws.sqs().findQueue("orders")?.arn.value;

  assertNonNullable(created.QueueUrl, "CreateQueue answered with a queue URL");
  assertNonNullable(queueArn, "The queue has an ARN");

  return { simAws, queueUrl: created.QueueUrl, queueArn };
}

/**
 * Make an execution role allowed to poll a queue.
 */
export async function makePollingRole(
  simAws: SimAws,
  queueArn: string,
  actions: readonly string[] = sqsPollingActions,
): Promise<string> {
  const role = await simAws.iam().createRole(
    new CreateRoleCommand({
      RoleName: "OrderConsumerRole",
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
      RoleName: "OrderConsumerRole",
      PolicyName: "ConsumeOrders",
      PolicyDocument: JSON.stringify({
        Version: "2012-10-17",
        Statement: { Effect: "Allow", Action: actions, Resource: queueArn },
      }),
    }),
  );

  const roleArn = role.Role.Arn;
  assertNonNullable(roleArn, "CreateRole answered with a role ARN");

  return roleArn;
}

/**
 * Make a function backed by a real in-process handler, so a test can watch what
 * the handler was given.
 */
export async function makeConsumerFunction(
  simAws: SimAws,
  roleArn: string,
  handler: SimLambdaHandler,
): Promise<string> {
  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: "order-consumer",
      Role: roleArn,
      Code: { ZipFile: makeLambdaZipFileInput(handler) },
    }),
  );

  return "order-consumer";
}

/**
 * A handler that records the events it is given.
 *
 * The event type is the parameter, because what a mapping delivers depends on
 * the event source it polls: a queue mapping hands over an SQS event and a
 * stream mapping hands over a DynamoDB stream event.
 */
export interface RecordingHandler<Event> {
  readonly handler: SimLambdaHandler;
  readonly events: Event[];
}

/**
 * Make a handler recording every event it receives, and returning a result.
 */
export function recordingHandler<Event = SimLambdaSqsEvent>(
  result: (event: Event) => unknown = (): undefined => undefined,
): RecordingHandler<Event> {
  const events: Event[] = [];

  return {
    events,
    handler: (event: unknown): unknown => {
      const received = event as Event;

      events.push(received);

      return result(received);
    },
  };
}

/**
 * One simulated AWS with a queue delivering to a function.
 */
export interface SimSqsEventSourceFixture extends SimSqsSourceQueue {
  readonly functionName: string;
  readonly roleArn: string;
  readonly events: SimLambdaSqsEvent[];
  readonly uuid: string;
}

interface SqsEventSourceOptions {
  readonly simAws?: SimAws;
  readonly queueAttributes?: Record<string, string>;
  readonly roleActions?: readonly string[];
  readonly handlerResult?: (event: SimLambdaSqsEvent) => unknown;
  readonly batchSize?: number;
  readonly functionResponseTypes?: readonly "ReportBatchItemFailures"[];
}

/**
 * Make a simulated AWS with a queue, a consumer function, and a mapping from
 * one to the other.
 */
export async function simAwsWithSqsEventSource(
  options: SqsEventSourceOptions = {},
): Promise<SimSqsEventSourceFixture> {
  const simAws = options.simAws ?? new SimAws();
  const queue = await makeSourceQueue(simAws, options.queueAttributes);
  const roleArn = await makePollingRole(
    simAws,
    queue.queueArn,
    options.roleActions,
  );
  const { handler, events } = recordingHandler(options.handlerResult);
  const functionName = await makeConsumerFunction(simAws, roleArn, handler);

  const mapping = await simAws.lambda().createEventSourceMapping(
    new CreateEventSourceMappingCommand({
      EventSourceArn: queue.queueArn,
      FunctionName: functionName,
      ...(options.batchSize !== undefined && { BatchSize: options.batchSize }),
      ...(options.functionResponseTypes !== undefined && {
        FunctionResponseTypes: [...options.functionResponseTypes],
      }),
    }),
  );

  assertNonNullable(mapping.UUID, "The mapping has a UUID");

  return { ...queue, functionName, roleArn, events, uuid: mapping.UUID };
}
