import { InvokeCommand } from "@aws-sdk/client-lambda";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimLambdaDestinationRecord } from "../../../lambda/destination/sim-lambda-destination-record.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

/**
 * A handler that always throws, so every asynchronous invocation of it runs
 * out of attempts.
 */
const ordersHandlerSource = `
exports.handler = async () => {
  throw new Error("orders handler failed");
};
`;

/**
 * The one message body waiting on a queue.
 */
async function receivedBody(simAws: SimAws, queueUrl: string): Promise<string> {
  const received = await simAws
    .account(accountIdOneOnes)
    .region("eu-west-2")
    .sqs()
    .receiveMessage(
      new ReceiveMessageCommand({
        QueueUrl: queueUrl,
        MaxNumberOfMessages: 10,
      }),
    );
  const body = received.Messages?.at(0)?.Body;
  assertTypeString(body);

  return body;
}

describe("Sim CDK Lambda asynchronous destinations local integration", () => {
  it("deploys a CDK onFailure destination and deadLetterQueue", async () => {
    // Given a CDK stack with a function that always throws, an onFailure
    // destination queue and a dead-letter queue, retrying nothing.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as destinations from "aws-cdk-lib/aws-lambda-destinations";
import * as sqs from "aws-cdk-lib/aws-sqs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const failuresQueue = new sqs.Queue(stack, "FailuresQueue");
const deadLetterQueue = new sqs.Queue(stack, "DeadLetterQueue");

new lambda.Function(stack, "OrdersFunction", {
  functionName: "cdk-orders",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(ordersHandlerSource)}),
  retryAttempts: 0,
  onFailure: new destinations.SqsDestination(failuresQueue),
  deadLetterQueue,
});

new cdk.CfnOutput(stack, "FailuresQueueUrl", {
  value: failuresQueue.queueUrl,
});

new cdk.CfnOutput(stack, "DeadLetterQueueUrl", {
  value: deadLetterQueue.queueUrl,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the
    // AWS::Lambda::EventInvokeConfig Resource or the DeadLetterConfig property
    // CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then an asynchronous invocation the handler throws on runs out of
    // attempts.
    await scoped.lambda().invoke(
      new InvokeCommand({
        FunctionName: "cdk-orders",
        InvocationType: "Event",
        Payload: JSON.stringify({ id: 7 }),
      }),
    );
    await simAws.backgroundTasksComplete();
    await simAws.clock().advanceBy({ minutes: 5 });

    // And the destination CDK's onFailure named holds the record real Lambda
    // sends, naming the event that was invoked.
    const failuresQueueUrl = stack.outputs.get("FailuresQueueUrl")?.value;
    assertTypeString(failuresQueueUrl);

    const record = JSON.parse(
      await receivedBody(simAws, failuresQueueUrl),
    ) as SimLambdaDestinationRecord;

    assertIdentical(record.requestContext.condition, "RetriesExhausted");
    assertIdentical(record.requestContext.approximateInvokeCount, 1);

    // And the queue CDK's deadLetterQueue named holds the event itself.
    const deadLetterQueueUrl = stack.outputs.get("DeadLetterQueueUrl")?.value;
    assertTypeString(deadLetterQueueUrl);
    assertIdentical(await receivedBody(simAws, deadLetterQueueUrl), '{"id":7}');

    assertNonNullable(
      scoped.lambda().getSimEventInvokeConfig("cdk-orders", "$LATEST"),
    );

    await simAws.backgroundTasksComplete();
  });
});
