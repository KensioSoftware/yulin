/**
 * Setup shared by the AWS::Lambda::EventInvokeConfig deployment tests, which
 * all need a template holding a failing function and somewhere for its results
 * to go.
 *
 * This lives under `test/` for the same reasons as
 * `test/lambda/async-destination-fixture.ts`: eslint rejects a test file that
 * exports helpers alongside its own `describe` calls, and `test/**` is
 * type-checked with everything else, excluded from the published build, not
 * collected as a suite, and not counted in coverage.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { assertArrayLength, assertNonNullable } from "@kensio/smartass";

import type { SimAws } from "../../src/service/aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../src/service/cloudformation/stack/sim-cfn-deployed-stack.type.js";
import type { CfnTemplateBodyRecord } from "../../src/service/cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../src/service/cloudformation/template/value/sim-cfn-template-value.js";
import type { SimLambdaDestinationRecord } from "../../src/service/lambda/destination/sim-lambda-destination-record.js";

export const ordersFailuresQueueArn =
  "arn:aws:sqs:us-east-1:888888888888:order-failures";

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * A template with a queue for the failures, an orders function, and an event
 * invoke config sending the function's failures to the queue, as CDK
 * synthesizes for `onFailure`.
 */
export function ordersTemplate(
  configProperties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrderFailures: {
        Type: "AWS::SQS::Queue",
        Properties: { QueueName: "order-failures" },
      },
      OrdersRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "OrdersRole",
          AssumeRolePolicyDocument: assumeRolePolicyDocument,
        },
      },
      OrdersFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "orders",
          Role: { "Fn::GetAtt": ["OrdersRole", "Arn"] },
        },
      },
      OrdersInvokeConfig: {
        Type: "AWS::Lambda::EventInvokeConfig",
        Properties: configProperties,
      },
    },
  };
}

/**
 * The properties of a config on the function itself, sending failures to the
 * template's queue and giving up after the first attempt.
 */
export function failureConfigProperties(): SimCfnTemplateValueRecord {
  return {
    FunctionName: { Ref: "OrdersFunction" },
    Qualifier: "$LATEST",
    MaximumRetryAttempts: 0,
    DestinationConfig: {
      OnFailure: { Destination: { "Fn::GetAtt": ["OrderFailures", "Arn"] } },
    },
  };
}

/**
 * The binding backing the template's function with a handler that always
 * throws.
 */
export function failingOrdersBinding(): {
  logicalId: string;
  handler: () => never;
} {
  return {
    logicalId: "OrdersFunction",
    handler: (): never => {
      throw new Error("orders handler failed");
    },
  };
}

/**
 * Deploy the orders template with a handler that always throws.
 */
export async function deployOrders(
  simAws: SimAws,
  configProperties: SimCfnTemplateValueRecord,
): Promise<SimCfnDeployedStack> {
  const stack = await simAws.cloudFormation().deployTemplate({
    stackName: "orders-stack",
    template: ordersTemplate(configProperties),
    bindings: [failingOrdersBinding()],
  });
  await stack.waitForDeployComplete();

  return stack;
}

/**
 * Invoke the deployed function asynchronously and let every retry it makes
 * fall due.
 */
export async function invokeOrders(
  simAws: SimAws,
  qualifier?: string,
): Promise<void> {
  await simAws.lambda().invoke(
    new InvokeCommand({
      FunctionName: "orders",
      Qualifier: qualifier,
      InvocationType: "Event",
      Payload: JSON.stringify({ id: 7 }),
    }),
  );
  await simAws.backgroundTasksComplete();
  await simAws.clock().advanceBy({ minutes: 5 });
}

/**
 * The one destination record waiting on the failures queue.
 */
export async function failureRecord(
  simAws: SimAws,
): Promise<SimLambdaDestinationRecord> {
  const received = await simAws.sqs().receiveMessage(
    new ReceiveMessageCommand({
      QueueUrl: simAws.sqs().findQueue("order-failures")?.url,
      MaxNumberOfMessages: 10,
    }),
  );

  assertArrayLength(received.Messages ?? [], 1);
  const body = received.Messages?.[0]?.Body;
  assertNonNullable(body, "a destination record arrived");

  return JSON.parse(body) as SimLambdaDestinationRecord;
}
