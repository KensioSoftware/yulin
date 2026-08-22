import { PutRecordCommand } from "@aws-sdk/client-firehose";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
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

describe("Sim CDK Firehose delivery stream deployment local integration", () => {
  it("deploys a CDK delivery stream that archives into its Bucket", async () => {
    // Given a CDK stack with a Bucket and an unnamed delivery stream writing
    // into it, which is the whole of what a CDK project declares here. CDK
    // synthesizes the delivery Role, its policy and the extended S3
    // destination around those two lines.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";
import * as s3 from "aws-cdk-lib/aws-s3";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const orderArchive = new s3.Bucket(stack, "OrderArchive", {
  bucketName: "cdk-order-archive",
});

const orderEvents = new firehose.DeliveryStream(stack, "OrderEvents", {
  destination: new firehose.S3Bucket(orderArchive, {
    dataOutputPrefix: "orders/",
    bufferingInterval: cdk.Duration.seconds(60),
    bufferingSize: cdk.Size.mebibytes(1),
  }),
});

new cdk.CfnOutput(stack, "OrderEventsName", {
  value: orderEvents.deliveryStreamName,
});

new cdk.CfnOutput(stack, "OrderEventsArn", {
  value: orderEvents.deliveryStreamArn,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the
    // AWS::KinesisFirehose::DeliveryStream Resource CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the name CDK output carries is the deployed delivery stream, named
    // after the stack and the logical ID because the template did not name it.
    const deliveryStreamName = stack.outputs.get("OrderEventsName")?.value;
    assertTypeString(deliveryStreamName);
    assertStringStartsWith(deliveryStreamName, "TestStack-OrderEvents");
    assertIdentical(
      stack.outputs.get("OrderEventsArn")?.value,
      `arn:aws:firehose:eu-west-2:${accountIdOneOnes}:deliverystream/${
        deliveryStreamName
      }`,
    );

    // And a record put onto it reaches the deployed Bucket, under the prefix
    // the CDK destination declared, once the buffering interval passes.
    await scoped.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: deliveryStreamName,
        Record: { Data: new TextEncoder().encode('{"id":"order-1"}\n') },
      }),
    );

    await simAws.clock().advanceBy({ minutes: 2 });

    const { Contents } = await scoped
      .s3()
      .listObjectsV2(new ListObjectsV2Command({ Bucket: "cdk-order-archive" }));

    assertArrayLength(Contents ?? [], 1);
    assertStringStartsWith(Contents?.[0]?.Key ?? "", "orders/");
  });
});
