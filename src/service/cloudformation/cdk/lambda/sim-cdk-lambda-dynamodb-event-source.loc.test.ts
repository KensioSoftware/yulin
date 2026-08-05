import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { ReceiveMessageCommand } from "@aws-sdk/client-sqs";
import {
  assertIdentical,
  assertStringStartsWith,
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
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const accountIdOneOnes = "111111111111";

/**
 * A handler sending each stream record's key on to the queue CDK put in its
 * environment, so the test can see what the mapping delivered.
 */
const projectorHandlerSource = `
const { SQSClient, SendMessageCommand } = require("@aws-sdk/client-sqs");
const client = new SQSClient({});
exports.handler = async (event) => {
  for (const record of event.Records) {
    await client.send(
      new SendMessageCommand({
        QueueUrl: process.env.PROJECTIONS_QUEUE_URL,
        MessageBody: JSON.stringify({
          eventName: record.eventName,
          orderId: record.dynamodb.Keys.orderId.S,
        }),
      }),
    );
  }
  return { projected: event.Records.length };
};
`;

describe("Sim CDK Lambda DynamoDB event source local integration", () => {
  it("deploys a CDK DynamoEventSource that delivers a table's changes", async () => {
    // Given a CDK stack with a streamed table and a function subscribed to it
    // through DynamoEventSource, sending what it is given on to a queue.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const ordersTable = new dynamodb.Table(stack, "OrdersTable", {
  partitionKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
  stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
});

const projectionsQueue = new sqs.Queue(stack, "ProjectionsQueue");

const projectorFunction = new lambda.Function(stack, "ProjectorFunction", {
  functionName: "cdk-order-projector",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(projectorHandlerSource)}),
  environment: {
    PROJECTIONS_QUEUE_URL: projectionsQueue.queueUrl,
  },
});

projectionsQueue.grantSendMessages(projectorFunction);

projectorFunction.addEventSource(
  new DynamoEventSource(ordersTable, {
    startingPosition: lambda.StartingPosition.TRIM_HORIZON,
  }),
);

new cdk.CfnOutput(stack, "OrdersTableName", {
  value: ordersTable.tableName,
});

new cdk.CfnOutput(stack, "ProjectionsQueueUrl", {
  value: projectionsQueue.queueUrl,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the
    // AWS::Lambda::EventSourceMapping Resource CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the table CDK named after the stack and the logical ID is deployed
    // with its stream.
    const tableName = stack.outputs.get("OrdersTableName")?.value;
    assertTypeString(tableName);
    assertStringStartsWith(tableName, "TestStack-OrdersTable");

    // And a write to the deployed table reaches the deployed function, whose
    // execution role was granted the stream by CDK's own inline policy.
    await scoped.dynamoDb().putItem(
      new PutItemCommand({
        TableName: tableName,
        Item: { orderId: { S: "order-1" }, total: { N: "101" } },
      }),
    );
    await simAws.backgroundTasksComplete();

    const queueUrl = stack.outputs.get("ProjectionsQueueUrl")?.value;
    assertTypeString(queueUrl);

    const received = await scoped
      .sqs()
      .receiveMessage(new ReceiveMessageCommand({ QueueUrl: queueUrl }));

    assertIdentical(
      received.Messages?.at(0)?.Body,
      JSON.stringify({ eventName: "INSERT", orderId: "order-1" }),
    );

    await simAws.backgroundTasksComplete();
  });
});
