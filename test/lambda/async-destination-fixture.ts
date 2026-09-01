/**
 * Setup shared by the asynchronous invocation tests, which all need a function
 * that fails a chosen number of times and somewhere for its result to go.
 *
 * This lives under `test/` for the same reasons as `test/sns/topic-fixture.ts`:
 * eslint rejects a test file that exports helpers alongside its own `describe`
 * calls, and `test/**` is type-checked with everything else, excluded from the
 * published build, not collected as a suite, and not counted in coverage.
 */

import {
  CreateFunctionCommand,
  InvokeCommand,
  PutFunctionEventInvokeConfigCommand,
} from "@aws-sdk/client-lambda";
import { CreateQueueCommand, ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "../../src/service/aws/sim-aws.js";
import { simIamRoleWithPolicyFactory } from "../../src/service/iam/role/sim-iam-role-with-policy.factory.js";
import type { SimLambdaDestinationRecord } from "../../src/service/lambda/destination/sim-lambda-destination-record.js";
import { makeLambdaZipFileInput } from "../../src/service/lambda/index.js";

export const simLambdaAsyncFunctionName = "orders";
export const simLambdaAsyncFunctionArn =
  "arn:aws:lambda:us-east-1:888888888888:function:orders";

export const simLambdaDestinationActions = [
  "sqs:SendMessage",
  "sns:Publish",
  "events:PutEvents",
  "lambda:InvokeFunction",
] as const;

/**
 * The ARN of a queue of a name in the default Account and Region.
 */
export function simLambdaQueueArn(queueName: string): string {
  return `arn:aws:sqs:us-east-1:888888888888:${queueName}`;
}

/**
 * One simulated AWS, and how many times the function it holds has run.
 */
export interface SimLambdaAsyncFixture {
  readonly simAws: SimAws;
  readonly attemptCount: () => number;
}

interface SimLambdaAsyncFunctionProperties {
  /**
   * How many attempts throw before one returns. Every attempt throws when this
   * is left out.
   */
  readonly failuresBeforeSuccess?: number | undefined;
  readonly deadLetterTargetArn?: string | undefined;
  readonly roleActions?: readonly string[] | undefined;
  readonly roleResource?: string | undefined;
}

/**
 * Make a simulated AWS holding one function that fails as often as asked.
 */
export async function simAwsWithAsyncFunction(
  properties: SimLambdaAsyncFunctionProperties = {},
): Promise<SimLambdaAsyncFixture> {
  const { failuresBeforeSuccess = Infinity } = properties;
  const simAws = new SimAws();
  let attempts = 0;
  const executionRole = await simIamRoleWithPolicyFactory.make(
    {
      roleName: "OrdersRole",
      policyName: "DestinationDelivery",
      actions: properties.roleActions ?? simLambdaDestinationActions,
      resource: properties.roleResource ?? "*",
    },
    simAws,
  );

  await simAws.lambda().createFunction(
    new CreateFunctionCommand({
      FunctionName: simLambdaAsyncFunctionName,
      Role: executionRole.Arn,
      DeadLetterConfig:
        properties.deadLetterTargetArn === undefined
          ? undefined
          : { TargetArn: properties.deadLetterTargetArn },
      Code: {
        ZipFile: makeLambdaZipFileInput((event: { readonly id?: number }) => {
          attempts += 1;

          if (attempts <= failuresBeforeSuccess) {
            throw new Error("orders handler failed");
          }

          return { handled: event.id };
        }),
      },
    }),
  );

  return { simAws, attemptCount: (): number => attempts };
}

/**
 * Write the event invoke config the function runs its asynchronous
 * invocations under.
 */
export async function putEventInvokeConfig(
  simAws: SimAws,
  input: {
    readonly MaximumRetryAttempts?: number;
    readonly MaximumEventAgeInSeconds?: number;
    readonly OnSuccess?: string;
    readonly OnFailure?: string;
  },
): Promise<void> {
  await simAws.lambda().putFunctionEventInvokeConfig(
    new PutFunctionEventInvokeConfigCommand({
      FunctionName: simLambdaAsyncFunctionName,
      MaximumRetryAttempts: input.MaximumRetryAttempts,
      MaximumEventAgeInSeconds: input.MaximumEventAgeInSeconds,
      DestinationConfig: {
        OnSuccess:
          input.OnSuccess === undefined
            ? undefined
            : { Destination: input.OnSuccess },
        OnFailure:
          input.OnFailure === undefined
            ? undefined
            : { Destination: input.OnFailure },
      },
    }),
  );
}

/**
 * Invoke the function asynchronously and let every retry it makes fall due.
 *
 * Five simulated minutes is past both of the delays real Lambda leaves before
 * a retry, so an invocation has finished with by the time this returns.
 */
export async function invokeAsyncAndSettle(simAws: SimAws): Promise<void> {
  await simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: simLambdaAsyncFunctionName,
      InvocationType: "Event",
      Payload: JSON.stringify({ id: 7 }),
    }),
  );
  await simAws.backgroundTasksComplete();
  await simAws.clock().advanceBy({ minutes: 5 });
}

/**
 * Make a queue and answer with its URL.
 */
export async function makeQueue(
  simAws: SimAws,
  queueName: string,
): Promise<string> {
  const created = await simAws
    .sqs()
    .createQueue(new CreateQueueCommand({ QueueName: queueName }));
  assertNonNullable(created.QueueUrl, "CreateQueue answered with a URL");

  return created.QueueUrl;
}

/**
 * Every message body waiting on a queue.
 */
export async function receivedBodies(
  simAws: SimAws,
  queueUrl: string,
): Promise<readonly string[]> {
  const received = await simAws.sqs().receiveMessage(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
    }),
  );

  return (received.Messages ?? []).map((message) => message.Body);
}

/**
 * The one destination record waiting on a queue.
 */
export async function receivedRecord(
  simAws: SimAws,
  queueUrl: string,
): Promise<SimLambdaDestinationRecord> {
  const [body] = await receivedBodies(simAws, queueUrl);
  assertNonNullable(body, "a destination record arrived");

  return JSON.parse(body) as SimLambdaDestinationRecord;
}
