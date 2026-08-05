import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  GetQueueAttributesCommand,
  ReceiveMessageCommand,
} from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertNonNullable,
  assertStringStartsWith,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { SimSqsQueueUrl } from "../../../sqs/queue/sim-sqs-queue-url.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const emptyBytes = new Uint8Array();
const accountIdOneOnes = "111111111111";

/**
 * A handler sending to the queue whose URL CDK put in its environment.
 */
const sendMessageHandlerSource = `
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const client = new SQSClient({});
exports.handler = async () => {
  await client.send(
    new SendMessageCommand({
      QueueUrl: process.env.ORDERS_QUEUE_URL,
      MessageBody: "order-1",
    }),
  );
  return { sent: true };
};
`;

describe("Sim CDK SQS Queue deployment local integration", () => {
  it("deploys a CDK queue a granted Lambda sends to", async () => {
    // Given a CDK stack with an unnamed queue and a Lambda granted send
    // access to it, handed the queue URL through its environment.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sqs from "aws-cdk-lib/aws-sqs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersQueue = new sqs.Queue(stack, "OrdersQueue", {
  visibilityTimeout: cdk.Duration.seconds(120),
  retentionPeriod: cdk.Duration.hours(2),
  deliveryDelay: cdk.Duration.seconds(5),
});

const producerFunction = new lambda.Function(stack, "ProducerFunction", {
  functionName: "cdk-order-producer",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(sendMessageHandlerSource)}),
  environment: {
    ORDERS_QUEUE_URL: ordersQueue.queueUrl,
  },
});

ordersQueue.grantSendMessages(producerFunction);

new cdk.CfnOutput(stack, "OrdersQueueUrl", {
  value: ordersQueue.queueUrl,
});

new cdk.CfnOutput(stack, "OrdersQueueArn", {
  value: ordersQueue.queueArn,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the AWS::SQS::Queue Resource
    // CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the queue URL CDK output carries is the deployed queue, named after
    // the stack and the logical ID because the template did not name it.
    const queueUrl = stack.outputs.get("OrdersQueueUrl")?.value;
    assertTypeString(queueUrl);

    const queueName = SimSqsQueueUrl.parse(queueUrl)?.name;
    assertTypeString(queueName);
    assertStringStartsWith(queueName, "TestStack-OrdersQueue");

    // And the attributes the CDK construct set are on it.
    const attributes = await scoped.sqs().getQueueAttributes(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ["All"],
      }),
    );
    assertNonNullable(attributes.Attributes);
    assertIdentical(attributes.Attributes["VisibilityTimeout"], "120");
    assertIdentical(attributes.Attributes["MessageRetentionPeriod"], "7200");
    assertIdentical(attributes.Attributes["DelaySeconds"], "5");
    assertIdentical(
      stack.outputs.get("OrdersQueueArn")?.value,
      attributes.Attributes["QueueArn"],
    );

    // And the deployed function sends to it as its granted execution role,
    // against the queue ARN the CDK grant produced.
    const invoked = await scoped
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "cdk-order-producer" }));

    assertUndefined(invoked.FunctionError);
    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    assertIdentical(payload, JSON.stringify({ sent: true }));

    // And the message is on the queue once its delivery delay has passed.
    await simAws.clock().advanceBy({ seconds: 5 });
    const received = await scoped
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(received.Messages?.at(0)?.Body, "order-1");

    await simAws.backgroundTasksComplete();
  });
});
