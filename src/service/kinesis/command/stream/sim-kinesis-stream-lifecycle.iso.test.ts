import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamCommand,
  DescribeStreamSummaryCommand,
  ListStreamsCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimKinesisResourceInUseException,
  SimKinesisResourceNotFoundException,
} from "../../error/sim-kinesis.error.js";
import { simKinesisStreamFactory } from "../../stream/sim-kinesis-stream.factory.js";

describe("Simulated Kinesis stream lifecycle", () => {
  it("lists and describes a stream it created", async () => {
    // Given a simulated AWS with no streams.
    const simAws = new SimAws();

    // When a stream is created.
    await simAws
      .kinesis()
      .createStream(
        new CreateStreamCommand({ StreamName: "orders", ShardCount: 2 }),
      );

    // Then it is listed, and it describes as active with the shards asked for.
    const listed = await simAws
      .kinesis()
      .listStreams(new ListStreamsCommand({}));
    assertArrayLength(listed.StreamNames, 1);
    assertIdentical(listed.StreamNames[0], "orders");

    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertIdentical(described.StreamDescription.StreamStatus, "ACTIVE");
    assertIdentical(
      described.StreamDescription.StreamARN,
      `arn:aws:kinesis:${simAws.defaultRegionName}:${simAws.defaultAccountId}:stream/orders`,
    );
    assertArrayLength(described.StreamDescription.Shards, 2);
  });

  it("summarises a stream without listing its shards", async () => {
    // Given a stream with three shards.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 3 }, simAws);

    // When it is summarised.
    const summary = await simAws
      .kinesis()
      .describeStreamSummary(
        new DescribeStreamSummaryCommand({ StreamName: "orders" }),
      );

    // Then the open shard count stands in for the shards themselves, and the
    // retention is the default Kinesis gives a new stream.
    const { StreamDescriptionSummary } = summary;
    assertIdentical(StreamDescriptionSummary.OpenShardCount, 3);
    assertIdentical(StreamDescriptionSummary.RetentionPeriodHours, 24);
    assertIdentical(StreamDescriptionSummary.ConsumerCount, 0);
    assertIdentical(
      StreamDescriptionSummary.StreamModeDetails.StreamMode,
      "PROVISIONED",
    );
  });

  it("gives an on-demand stream the four shards Kinesis starts it with", async () => {
    // Given a simulated AWS.
    const simAws = new SimAws();

    // When a stream is created in on-demand mode, which takes no shard count.
    await simAws.kinesis().createStream(
      new CreateStreamCommand({
        StreamName: "events",
        StreamModeDetails: { StreamMode: "ON_DEMAND" },
      }),
    );

    // Then it has the four shards real Kinesis starts one with.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "events" }));
    assertArrayLength(described.StreamDescription.Shards, 4);
    assertIdentical(
      described.StreamDescription.StreamModeDetails.StreamMode,
      "ON_DEMAND",
    );
  });

  it("refuses a second stream under a name it already holds", async () => {
    // Given a stream named orders.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a second stream is created under the same name.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .kinesis()
        .createStream(new CreateStreamCommand({ StreamName: "orders" }));
    });

    // Then it is refused rather than answering with the stream that is there.
    assertInstanceOf(error, SimKinesisResourceInUseException);
    assertStringIncludes(error.message, "already exists");
  });

  it("frees the name of a deleted stream straight away", async () => {
    // Given a stream named orders.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({ shardCount: 2 }, simAws);

    // When it is deleted and a new one is created under the same name.
    await simAws
      .kinesis()
      .deleteStream(new DeleteStreamCommand({ StreamName: "orders" }));
    await simAws
      .kinesis()
      .createStream(new CreateStreamCommand({ StreamName: "orders" }));

    // Then the new stream is the one that is there, with its own shards.
    const described = await simAws
      .kinesis()
      .describeStream(new DescribeStreamCommand({ StreamName: "orders" }));
    assertArrayLength(described.StreamDescription.Shards, 1);
  });

  it("refuses a stream ARN naming another account", async () => {
    // Given a stream named orders in this account.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a stream of that name in another account is described.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.kinesis().describeStream(
        new DescribeStreamCommand({
          StreamARN: `arn:aws:kinesis:${simAws.defaultRegionName}:222222222222:stream/orders`,
        }),
      );
    });

    // Then it is not found, rather than answered by the local stream.
    assertInstanceOf(error, SimKinesisResourceNotFoundException);
  });
});
