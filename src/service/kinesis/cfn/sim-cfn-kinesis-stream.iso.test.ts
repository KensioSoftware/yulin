import { DescribeStreamCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimKinesisResourceNotFoundException } from "../error/sim-kinesis.error.js";

/**
 * A stack holding one stream, and outputs reading it both ways.
 */
function streamTemplate(
  properties: SimCfnTemplateValueRecord,
): CfnTemplateBodyRecord {
  return {
    Resources: {
      OrdersStream: { Type: "AWS::Kinesis::Stream", Properties: properties },
    },
    Outputs: {
      StreamRef: { Value: { Ref: "OrdersStream" } },
      StreamArn: { Value: { "Fn::GetAtt": ["OrdersStream", "Arn"] } },
    },
  };
}

describe("deployed AWS::Kinesis::Stream Resources", () => {
  it("creates a stream with the shard count the template declared", async () => {
    // Given a template declaring a stream with two shards.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({ Name: "orders", ShardCount: 2 }),
    });
    await stack.waitForDeployComplete();

    // Then the stream is there, with the shards it asked for.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertArrayLength(described.StreamDescription.Shards, 2);
    assertIdentical(described.StreamDescription.StreamStatus, "ACTIVE");
  });

  it("answers a Ref with the name and Arn with the stream ARN", async () => {
    // Given a template reading its stream both ways.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({ Name: "orders" }),
    });
    await stack.waitForDeployComplete();

    // Then the Ref is the name and the attribute is the ARN, which is the way
    // round real CloudFormation publishes them.
    assertIdentical(stack.outputs.get("StreamRef")?.value, "orders");
    assertIdentical(
      stack.outputs.get("StreamArn")?.value,
      `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`,
    );
  });

  it("names an unnamed stream after the stack and the logical ID", async () => {
    // Given a template that names no stream.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({ ShardCount: 1 }),
    });
    await stack.waitForDeployComplete();

    // Then CloudFormation named it, as real CloudFormation does.
    assertIdentical(
      stack.outputs.get("StreamRef")?.value,
      "orders-stack-OrdersStream",
    );
  });

  it("gives an on-demand stream the four shards Kinesis starts it with", async () => {
    // Given a template declaring an on-demand stream, which takes no shard
    // count.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({
        Name: "orders",
        StreamModeDetails: { StreamMode: "ON_DEMAND" },
      }),
    });
    await stack.waitForDeployComplete();

    // Then it has the four shards real Kinesis starts one with.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertArrayLength(described.StreamDescription.Shards, 4);
    assertIdentical(
      described.StreamDescription.StreamModeDetails.StreamMode,
      "ON_DEMAND",
    );
  });

  it("keeps records for the retention the template declared", async () => {
    // Given a template declaring a week of retention, which is more than the
    // default a stream is created with.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({ Name: "orders", RetentionPeriodHours: 168 }),
    });
    await stack.waitForDeployComplete();

    // Then the stream keeps records for that long.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertIdentical(described.StreamDescription.RetentionPeriodHours, 168);
  });

  it("leaves retention alone when the template declares the default", async () => {
    // Given a template declaring the retention a new stream already has, which
    // is also the least Kinesis accepts, so a template can never ask for less.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({ Name: "orders", RetentionPeriodHours: 24 }),
    });
    await stack.waitForDeployComplete();

    // Then the stream keeps records for that long, and nothing tried to change
    // it, which real Kinesis would have refused as a change to what it already
    // keeps.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertIdentical(described.StreamDescription.RetentionPeriodHours, 24);
  });

  it("keeps the tags the template declared", async () => {
    // Given a template tagging its stream.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({
        Name: "orders",
        Tags: [{ Key: "team", Value: "orders" }],
      }),
    });
    await stack.waitForDeployComplete();

    // Then the stream carries them, readable through the simulator's own
    // accessor since the Kinesis tag operations are unsimulated.
    assertIdentical(
      simAws.kinesis().findStream("orders")?.tags["team"],
      "orders",
    );
  });

  it("records encryption as unsimulated and creates the stream anyway", async () => {
    // Given a template asking for a stream encrypted with a KMS key.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({
        Name: "orders",
        StreamEncryption: { EncryptionType: "KMS", KeyId: "alias/aws/kinesis" },
      }),
    });
    await stack.waitForDeployComplete();

    // Then the stream is there, and the property it could not act on is
    // recorded where a test can find it rather than failing the stack.
    assertIdentical(simAws.kinesis().findStream("orders")?.name, "orders");

    const ignored = stack.resources
      .flatMap((resource) => [...resource.ignoredProperties])
      .filter((property) => property.path === "StreamEncryption");
    assertArrayLength(ignored, 1);
    assertStringIncludes(ignored[0].reason, "encryption is not simulated");
  });

  it("deletes the stream when the stack is deleted", async () => {
    // Given a deployed stream.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "orders-stack",
      template: streamTemplate({ Name: "orders" }),
    });
    await stack.waitForDeployComplete();

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the stream has gone with it, and the Resource says so.
    assertIdentical(
      stack.getResource("OrdersStream")?.status,
      "DELETE_COMPLETE",
    );

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    });
    assertInstanceOf(error, SimKinesisResourceNotFoundException);
  });
});
