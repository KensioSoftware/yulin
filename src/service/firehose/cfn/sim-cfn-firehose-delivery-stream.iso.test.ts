import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deliveredObjectBody,
  deliveredObjectKeys,
} from "../../../../test/firehose/firehose-delivery-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { SimFirehoseResourceNotFoundException } from "../error/sim-firehose.error.js";
import {
  cdkKinesisSource,
  cdkS3Destination,
  orderArchiveBucketName,
  simCfnFirehoseDeliveryStreamTemplateFactory,
} from "./sim-cfn-firehose-delivery-stream-template.factory.js";

describe("deployed AWS::KinesisFirehose::DeliveryStream Resources", () => {
  /**
   * Put one order event onto a deployed delivery stream.
   */
  async function putOrderEvent(simAws: SimAws, name: string): Promise<void> {
    await simAws.firehose().putRecord({
      input: {
        DeliveryStreamName: name,
        Record: { Data: new TextEncoder().encode('{"id":"order-1"}\n') },
      },
    });
  }

  it("delivers a record put onto a deployed delivery stream", async () => {
    // Given a stack holding a Bucket, a delivery Role and the delivery stream
    // CDK synthesizes for an S3Bucket destination.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make(),
    });
    await stack.waitForDeployComplete();

    // When a record is put onto the deployed delivery stream and the buffering
    // interval passes.
    await putOrderEvent(simAws, "order-events");
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then it is in the deployed Bucket, which means the Bucket ARN the
    // template read off the Bucket beside it resolved to that Bucket.
    const keys = await deliveredObjectKeys(simAws, orderArchiveBucketName);
    assertArrayLength(keys, 1);
    assertIdentical(
      await deliveredObjectBody(simAws, orderArchiveBucketName, keys[0]),
      '{"id":"order-1"}\n',
    );
  });

  it("delivers from the Kinesis stream the template named as its source", async () => {
    // Given a stack holding a Kinesis stream, a source Role, a Bucket, a
    // delivery Role and a delivery stream reading the one into the other.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make({
        sourceStreamName: "orders",
        deliveryStreamProperties: {
          DeliveryStreamName: "order-events",
          DeliveryStreamType: "KinesisStreamAsSource",
          KinesisStreamSourceConfiguration: cdkKinesisSource,
          ExtendedS3DestinationConfiguration: cdkS3Destination,
        },
      }),
    });
    await stack.waitForDeployComplete();

    // When a record is put onto the deployed stream and the buffering interval
    // passes.
    await simAws.kinesis().putRecord({
      input: {
        StreamName: "orders",
        PartitionKey: "order-1",
        Data: new TextEncoder().encode('{"id":"order-1"}\n'),
      },
    });
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then it reached the deployed Bucket, which means the delivery stream
    // opened the stream the template named and read it as the Role beside it.
    const keys = await deliveredObjectKeys(simAws, orderArchiveBucketName);
    assertArrayLength(keys, 1);
    assertIdentical(
      await deliveredObjectBody(simAws, orderArchiveBucketName, keys[0]),
      '{"id":"order-1"}\n',
    );
  });

  it("answers a Ref with the name and Arn with the delivery stream ARN", async () => {
    // Given a template reading its delivery stream both ways.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make(),
    });
    await stack.waitForDeployComplete();

    // Then the Ref is the name and the attribute is the ARN, which is the way
    // round real CloudFormation publishes them.
    assertIdentical(stack.outputs.get("StreamRef")?.value, "order-events");
    assertIdentical(
      stack.outputs.get("StreamArn")?.value,
      `arn:aws:firehose:${simAws.defaultRegionName}:` +
        `${simAws.defaultAccountId}:deliverystream/order-events`,
    );
  });

  it("names an unnamed delivery stream after the stack and the logical ID", async () => {
    // Given a template that names no delivery stream.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make({
        deliveryStreamProperties: {
          ExtendedS3DestinationConfiguration: cdkS3Destination,
        },
      }),
    });
    await stack.waitForDeployComplete();

    // Then CloudFormation named it, as real CloudFormation names one.
    assertIdentical(
      stack.outputs.get("StreamRef")?.value,
      "orders-stack-OrderEvents",
    );
    assertIdentical(
      simAws.firehose().findDeliveryStream("orders-stack-OrderEvents")?.name,
      "orders-stack-OrderEvents",
    );
  });

  it("buffers and prefixes the way the destination declared", async () => {
    // Given a template declaring a prefix and both buffering bounds.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make({
        deliveryStreamProperties: {
          DeliveryStreamName: "order-events",
          ExtendedS3DestinationConfiguration: {
            ...cdkS3Destination,
            Prefix: "orders/archive/",
            BufferingHints: { IntervalInSeconds: 120, SizeInMBs: 3 },
          },
        },
      }),
    });
    await stack.waitForDeployComplete();

    // When the deployed delivery stream is described.
    const described = await simAws.firehose().describeDeliveryStream({
      input: { DeliveryStreamName: "order-events" },
    });
    const destination =
      described.DeliveryStreamDescription.Destinations[0]
        ?.ExtendedS3DestinationDescription;
    assertNonNullable(destination);

    // Then it carries the prefix and the two bounds the template declared.
    assertIdentical(destination.Prefix, "orders/archive/");
    assertIdentical(destination.BufferingHints.IntervalInSeconds, 120);
    assertIdentical(destination.BufferingHints.SizeInMBs, 3);

    // And a record put onto it lands under that prefix.
    await putOrderEvent(simAws, "order-events");
    await simAws.clock().advanceBy({ minutes: 3 });

    const [key] = await deliveredObjectKeys(simAws, orderArchiveBucketName);
    assertStringIncludes(key ?? "", "orders/archive/");
  });

  it("writes as the Role the template named", async () => {
    // Given a stack whose delivery Role may read the Bucket and may not write
    // to it.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make({
        allowedActions: ["s3:GetObject", "s3:ListBucket"],
      }),
    });
    await stack.waitForDeployComplete();

    // When a record is put onto the delivery stream and the interval passes.
    await putOrderEvent(simAws, "order-events");
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then nothing reached the Bucket, and the delivery was refused as that
    // Role rather than as anyone else.
    assertArrayLength(
      await deliveredObjectKeys(simAws, orderArchiveBucketName),
      0,
    );

    const failures = simAws.firehose().getDeliveryFailures();
    assertArrayLength(failures, 1);
    assertTrue(failures[0].wasRefused);
    assertIdentical(failures[0].roleArn, stack.outputs.get("RoleArn")?.value);
  });

  it("deletes the delivery stream when the stack is deleted", async () => {
    // Given a deployed delivery stream.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: simCfnFirehoseDeliveryStreamTemplateFactory.make(),
    });
    await stack.waitForDeployComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the delivery stream has gone with it, and the Resource says so.
    assertIdentical(
      stack.getResource("OrderEvents")?.status,
      "DELETE_COMPLETE",
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().describeDeliveryStream({
        input: { DeliveryStreamName: "order-events" },
      });
    });
    assertInstanceOf(error, SimFirehoseResourceNotFoundException);
  });
});
