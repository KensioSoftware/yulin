import { assertTypeString } from "@kensio/smartass";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimLambdaStreamFailureRecord } from "../../../lambda/event-source/poll/sim-lambda-stream-failure-record.js";

describe("CDK stream failure destinations", () => {
  it.each(["dynamodb", "kinesis"])(
    "deploys and delivers a %s failure destination",
    async (source) => {
      // Given a CDK stream subscription with an on-failure destination and generated grants.
      const project = new TestCdkProject();
      await project.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib/core";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as iam from "aws-cdk-lib/aws-iam";
import { SqsSubscription } from "aws-cdk-lib/aws-sns-subscriptions";
const app = new cdk.App();
const stack = new cdk.Stack(app, "StreamFailures", { env: { account: "111111111111", region: "eu-west-2" } });
const queue = new sqs.Queue(stack, "Failures");
const fn = new lambda.Function(stack, "Consumer", {
  runtime: lambda.Runtime.NODEJS_24_X,
  handler: "index.handler",
  code: lambda.Code.fromInline('exports.handler = async () => { throw new Error("Failed stream batch"); };'),
});
if (${JSON.stringify(source)} === "dynamodb") {
  const table = new dynamodb.Table(stack, "Orders", {
    partitionKey: { name: "orderId", type: dynamodb.AttributeType.STRING },
    stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
  });
  fn.addEventSource(new sources.DynamoEventSource(table, {
    startingPosition: lambda.StartingPosition.TRIM_HORIZON,
    retryAttempts: 10,
    maxRecordAge: cdk.Duration.hours(1),
    onFailure: new sources.SqsDlq(queue),
  }));
  new cdk.CfnOutput(stack, "SourceName", { value: table.tableName });
} else {
  const stream = new kinesis.Stream(stack, "Orders");
  fn.addToRolePolicy(new iam.PolicyStatement({ actions: ["kinesis:ListStreams"], resources: ["*"] }));
  const topic = new sns.Topic(stack, "FailureTopic");
  topic.addSubscription(new SqsSubscription(queue, { rawMessageDelivery: true }));
  fn.addEventSource(new sources.KinesisEventSource(stream, {
    startingPosition: lambda.StartingPosition.TRIM_HORIZON,
    retryAttempts: 10,
    maxRecordAge: cdk.Duration.hours(1),
    onFailure: new sources.SnsDlq(topic),
  }));
  new cdk.CfnOutput(stack, "SourceName", { value: stream.streamName });
}
new cdk.CfnOutput(stack, "QueueUrl", { value: queue.queueUrl });
app.synth();
`);
      const output = await project.synth();
      const simAws = new SimAws();
      const scope = simAws.account("111111111111").region("eu-west-2");

      // When the unmodified template is deployed locally and a record exhausts ten retries.
      const stack = await scope
        .cloudFormation()
        .deployTemplateFile(path.join(output, "StreamFailures.template.json"));
      await simAws.backgroundTasksComplete();
      const sourceName = stack.outputs.get("SourceName")?.value;
      const queueUrl = stack.outputs.get("QueueUrl")?.value;
      assertTypeString(sourceName);
      assertTypeString(queueUrl);
      if (source === "dynamodb") {
        await scope.dynamoDb().putItem({
          input: {
            TableName: sourceName,
            Item: { orderId: { S: "order-1" } },
          },
        });
      } else {
        await scope.kinesis().putRecord({
          input: {
            StreamName: sourceName,
            PartitionKey: "order-1",
            Data: new TextEncoder().encode("order-1"),
          },
        });
      }
      await simAws.backgroundTasksComplete();
      await simAws.clock().advanceBy({ hours: 1 });

      // Then the destination receives the batch metadata through the permissions CDK granted.
      const messages = await scope
        .sqs()
        .receiveMessage({ input: { QueueUrl: queueUrl } });
      expect(messages.Messages).toHaveLength(1);
      const record = JSON.parse(
        messages.Messages?.[0]?.Body ?? "null",
      ) as SimLambdaStreamFailureRecord;
      expect(record.requestContext).toMatchObject({
        condition: "RetryAttemptsExhausted",
        approximateInvokeCount: 11,
      });
      const mapping = await scope
        .lambda()
        .listEventSourceMappings({ input: {} });
      expect(mapping.EventSourceMappings[0]).toMatchObject({
        MaximumRetryAttempts: 10,
        MaximumRecordAgeInSeconds: 3600,
      });
      expect(
        mapping.EventSourceMappings[0]?.DestinationConfig?.OnFailure
          ?.Destination,
      ).toMatch(/^arn:aws:(sqs|sns):/u);
    },
  );
});
