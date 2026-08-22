import {
  CreateStreamCommand,
  DeleteStreamCommand,
  DescribeStreamCommand,
  DescribeStreamSummaryCommand,
  GetRecordsCommand,
  GetShardIteratorCommand,
  KinesisClient,
  ListStreamsCommand,
  PutRecordCommand,
  PutRecordsCommand,
} from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimSdk } from "../../../sdk/index.js";

describe("Kinesis SDK interception", () => {
  it("carries an event from an intercepted producer to an intercepted consumer", async () => {
    // Given an intercepted Kinesis SDK client.
    using simSdk = new SimSdk();
    simSdk.intercept(KinesisClient);

    const kinesis = new KinesisClient({ region: "eu-west-2" });

    // When ordinary SDK code creates a stream, puts a record and reads it back.
    await kinesis.send(
      new CreateStreamCommand({ StreamName: "orders", ShardCount: 1 }),
    );
    await kinesis.send(
      new PutRecordCommand({
        StreamName: "orders",
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode('{"id":"order-1"}'),
      }),
    );

    const iterator = await kinesis.send(
      new GetShardIteratorCommand({
        StreamName: "orders",
        ShardId: "shardId-000000000000",
        ShardIteratorType: "TRIM_HORIZON",
      }),
    );
    const read = await kinesis.send(
      new GetRecordsCommand({ ShardIterator: iterator.ShardIterator }),
    );

    // Then the record comes back, with nothing touching the network.
    assertArrayLength(read.Records ?? [], 1);
    assertIdentical(
      new TextDecoder().decode(read.Records?.[0]?.Data),
      '{"id":"order-1"}',
    );
    assertIdentical(read.Records?.[0]?.PartitionKey, "customer-1");
  });

  it("routes every stream command an intercepted client sends", async () => {
    // Given an intercepted Kinesis SDK client holding one stream.
    using simSdk = new SimSdk();
    simSdk.intercept(KinesisClient);

    const kinesis = new KinesisClient({ region: "eu-west-2" });
    await kinesis.send(
      new CreateStreamCommand({ StreamName: "orders", ShardCount: 2 }),
    );

    // When ordinary SDK code lists, describes and summarises it.
    const listed = await kinesis.send(new ListStreamsCommand({}));
    const described = await kinesis.send(
      new DescribeStreamCommand({ StreamName: "orders" }),
    );
    const summary = await kinesis.send(
      new DescribeStreamSummaryCommand({ StreamName: "orders" }),
    );

    // Then each answers from the simulated stream.
    assertIdentical(listed.StreamNames?.[0], "orders");
    assertArrayLength(described.StreamDescription?.Shards ?? [], 2);
    assertIdentical(summary.StreamDescriptionSummary?.OpenShardCount, 2);
  });

  it("routes a batch put an intercepted client sends", async () => {
    // Given an intercepted Kinesis SDK client holding one stream.
    using simSdk = new SimSdk();
    simSdk.intercept(KinesisClient);

    const kinesis = new KinesisClient({ region: "eu-west-2" });
    await kinesis.send(new CreateStreamCommand({ StreamName: "orders" }));

    // When ordinary SDK code puts a batch of records.
    const put = await kinesis.send(
      new PutRecordsCommand({
        StreamName: "orders",
        Records: [
          {
            PartitionKey: "customer-1",
            Data: new TextEncoder().encode("order-1"),
          },
          {
            PartitionKey: "customer-2",
            Data: new TextEncoder().encode("order-2"),
          },
        ],
      }),
    );

    // Then both records are on the stream.
    assertIdentical(put.FailedRecordCount, 0);
    assertArrayLength(put.Records ?? [], 2);
    assertTrue((put.Records?.[0]?.SequenceNumber ?? "").length > 0);
  });

  it("routes a stream deletion an intercepted client sends", async () => {
    // Given an intercepted Kinesis SDK client holding one stream.
    using simSdk = new SimSdk();
    simSdk.intercept(KinesisClient);

    const kinesis = new KinesisClient({ region: "eu-west-2" });
    await kinesis.send(new CreateStreamCommand({ StreamName: "orders" }));

    // When ordinary SDK code deletes it.
    await kinesis.send(new DeleteStreamCommand({ StreamName: "orders" }));

    // Then nothing is left to list.
    const listed = await kinesis.send(new ListStreamsCommand({}));
    assertArrayLength(listed.StreamNames ?? [], 0);
  });

  it("names the commands it can handle", () => {
    // Given a simulated Kinesis.
    using simSdk = new SimSdk();

    // When its SDK router is asked what it handles.
    const supported = simSdk.simAws.kinesis().sdkCommandRouter();

    // Then every command this service simulates is named, and one it does not
    // is absent.
    assertArrayLength(supported.supportedCommandNames(), 9);
    assertUndefined(supported.route("RegisterStreamConsumerCommand"));
  });
});
