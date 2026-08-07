import { PublishCommand } from "@aws-sdk/client-sns";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import { assertIdentical, assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

/**
 * A handler forwarding the SNS message it was invoked with to the audit queue,
 * so the invocation leaves something behind to assert on.
 */
const consumerHandlerSource = `
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const client = new SQSClient({});
exports.handler = async (event) => {
  await client.send(
    new SendMessageCommand({
      QueueUrl: process.env.AUDIT_QUEUE_URL,
      MessageBody: event.Records[0].Sns.Message,
    }),
  );
  return { handled: true };
};
`;

/**
 * The body of the one message waiting on a queue.
 */
async function receivedBody(simAws: SimAws, queueUrl: string): Promise<string> {
  const received = await simAws
    .account(accountIdOneOnes)
    .region("eu-west-2")
    .sqs()
    .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

  const body = received.Messages?.at(0)?.Body;
  assertTypeString(body);

  return body;
}

describe("Sim CDK SNS subscription deployment local integration", () => {
  it("delivers a publish to the queue and the function CDK subscribed", async () => {
    // Given a CDK stack subscribing a queue and a function to one topic, with
    // nothing added by hand: the AWS::SQS::QueuePolicy and the
    // AWS::Lambda::Permission CDK emits alongside them are what authorize the
    // two deliveries.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import * as sqs from "aws-cdk-lib/aws-sqs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersTopic = new sns.Topic(stack, "OrdersTopic", {
  displayName: "Orders",
});

const fulfilmentQueue = new sqs.Queue(stack, "FulfilmentQueue");
ordersTopic.addSubscription(new subscriptions.SqsSubscription(fulfilmentQueue));

const auditQueue = new sqs.Queue(stack, "AuditQueue");

const consumerFunction = new lambda.Function(stack, "ConsumerFunction", {
  functionName: "cdk-order-consumer",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(consumerHandlerSource)}),
  environment: {
    AUDIT_QUEUE_URL: auditQueue.queueUrl,
  },
});

auditQueue.grantSendMessages(consumerFunction);
ordersTopic.addSubscription(
  new subscriptions.LambdaSubscription(consumerFunction),
);

new cdk.CfnOutput(stack, "OrdersTopicArn", { value: ordersTopic.topicArn });
new cdk.CfnOutput(stack, "FulfilmentQueueUrl", {
  value: fulfilmentQueue.queueUrl,
});
new cdk.CfnOutput(stack, "AuditQueueUrl", { value: auditQueue.queueUrl });

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // And a message is published to the topic the CDK output names.
    const topicArn = stack.outputs.get("OrdersTopicArn")?.value;
    assertTypeString(topicArn);

    await scoped
      .sns()
      .publish(new PublishCommand({ TopicArn: topicArn, Message: "order-1" }));
    await simAws.backgroundTasksComplete();

    // Then the subscribed queue received it, wrapped in the SNS envelope.
    const fulfilmentQueueUrl = stack.outputs.get("FulfilmentQueueUrl")?.value;
    assertTypeString(fulfilmentQueueUrl);

    const envelope = JSON.parse(
      await receivedBody(simAws, fulfilmentQueueUrl),
    ) as { Type: string; Message: string };
    assertIdentical(envelope.Type, "Notification");
    assertIdentical(envelope.Message, "order-1");

    // And the subscribed function was invoked with it, which it left on the
    // audit queue.
    const auditQueueUrl = stack.outputs.get("AuditQueueUrl")?.value;
    assertTypeString(auditQueueUrl);

    assertIdentical(await receivedBody(simAws, auditQueueUrl), "order-1");

    await simAws.backgroundTasksComplete();
  });
});
