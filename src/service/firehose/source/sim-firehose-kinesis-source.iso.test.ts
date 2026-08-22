import { DescribeDeliveryStreamCommand } from "@aws-sdk/client-firehose";
import { PutRecordCommand, PutRecordsCommand } from "@aws-sdk/client-kinesis";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deliveredObjectBody,
  deliveredObjectKeys,
  makeFirehoseDelivery,
  makeFirehoseDeliveryDestination,
} from "../../../../test/firehose/firehose-delivery-fixture.js";
import { makeFirehoseKinesisSource } from "../../../../test/firehose/firehose-kinesis-source-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";
import { simKinesisStreamFactory } from "../../kinesis/stream/sim-kinesis-stream.factory.js";
import { simFirehoseDeliveryStreamFactory } from "../stream/sim-firehose-delivery-stream.factory.js";

describe("A simulated Firehose delivery stream reading a Kinesis stream", () => {
  /**
   * The bytes of one JSON line, the way a producer writes one onto a stream.
   */
  function orderLine(id: string): Uint8Array {
    return new TextEncoder().encode(`${JSON.stringify({ id })}\n`);
  }

  /**
   * One batch of orders to put on a stream, each under its own partition key.
   */
  function orderBatch(
    batch: number,
    size: number,
  ): { PartitionKey: string; Data: Uint8Array }[] {
    return Array.from({ length: size }, (_unused, index) => ({
      PartitionKey: `order-${batch}-${index}`,
      Data: orderLine(`order-${batch}-${index}`),
    }));
  }

  /**
   * Put one order onto a stream, under its own partition key.
   */
  async function putOrder(
    simAws: SimAws,
    streamName: string,
    id: string,
  ): Promise<void> {
    await simAws.kinesis().putRecord(
      new PutRecordCommand({
        StreamName: streamName,
        PartitionKey: id,
        Data: orderLine(id),
      }),
    );
  }

  it("delivers a record put on the stream after it was created", async () => {
    // Given a delivery stream reading a stream, buffering for a minute.
    const simAws = new SimAws();
    const { bucketName, streamName } = await makeFirehoseKinesisSource(simAws, {
      intervalInSeconds: 60,
    });

    // When a record is put onto the stream and the interval passes.
    await putOrder(simAws, streamName, "order-1");
    await simAws.clock().advanceBy({ seconds: 60 });

    // Then it is in the Bucket, holding the bytes that were put on the stream.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);
    assertIdentical(
      await deliveredObjectBody(simAws, bucketName, keys[0]),
      '{"id":"order-1"}\n',
    );
  });

  it("leaves a record put before it was created where it is", async () => {
    // Given a stream that already holds a record, and a delivery stream
    // created after it was put.
    const simAws = new SimAws();
    const stream = await simKinesisStreamFactory.make({}, simAws);
    await putOrder(simAws, stream.name, "order-1");

    const { bucketName, roleArn } =
      await makeFirehoseDeliveryDestination(simAws);
    await simFirehoseDeliveryStreamFactory.make(
      { bucketName, roleArn, sourceStreamArn: stream.arn },
      simAws,
    );

    // When another record is put and the buffering interval passes.
    await putOrder(simAws, stream.name, "order-2");
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then only the record put afterwards was delivered. Real Firehose starts
    // at the end of the stream, and what was already on it stays there.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);
    assertIdentical(
      await deliveredObjectBody(simAws, bucketName, keys[0]),
      '{"id":"order-2"}\n',
    );
  });

  it("reads every shard of the stream", async () => {
    // Given a delivery stream reading a stream of four shards.
    const simAws = new SimAws();
    const { bucketName, streamName } = await makeFirehoseKinesisSource(simAws, {
      shardCount: 4,
    });

    // When records whose partition keys spread across the shards are put.
    await simAws.kinesis().putRecords(
      new PutRecordsCommand({
        StreamName: streamName,
        Records: ["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => ({
          PartitionKey: key,
          Data: orderLine(key),
        })),
      }),
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then all of them arrived, whichever shard they landed on.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);

    const body = await deliveredObjectBody(simAws, bucketName, keys[0]);

    for (const key of ["a", "b", "c", "d", "e", "f", "g", "h"]) {
      assertStringIncludes(body, `{"id":"${key}"}`);
    }
  });

  it("buffers what it reads across intervals", async () => {
    // Given a delivery stream reading a stream, buffering for a minute.
    const simAws = new SimAws();
    const { bucketName, streamName } = await makeFirehoseKinesisSource(simAws, {
      intervalInSeconds: 60,
    });
    // When a record is put in each of two intervals.
    await putOrder(simAws, streamName, "order-1");
    await simAws.clock().advanceBy({ seconds: 90 });

    await putOrder(simAws, streamName, "order-2");
    await simAws.clock().advanceBy({ seconds: 90 });

    // Then each interval delivered its own Object.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 2);
    assertIdentical(
      await deliveredObjectBody(simAws, bucketName, keys[1]),
      '{"id":"order-2"}\n',
    );
  });

  it("stops reading once the delivery stream is deleted", async () => {
    // Given a delivery stream reading a stream.
    const simAws = new SimAws();
    const { bucketName, streamName, deliveryStream } =
      await makeFirehoseKinesisSource(simAws);

    // When it is deleted, and a record is put on the stream afterwards.
    await simAws.firehose().deleteDeliveryStream({
      input: { DeliveryStreamName: deliveryStream.name },
    });
    await putOrder(simAws, streamName, "order-1");
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then nothing was read and nothing was written. The record stays on the
    // stream for whatever else is reading it.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 0);
  });

  it("reports the stream it reads and the Role it reads as", async () => {
    // Given a delivery stream reading a stream.
    const simAws = new SimAws();
    const { deliveryStream, streamArn, sourceRoleArn } =
      await makeFirehoseKinesisSource(simAws);

    // When it is described.
    const described = await simAws.firehose().describeDeliveryStream(
      new DescribeDeliveryStreamCommand({
        DeliveryStreamName: deliveryStream.name,
      }),
    );

    // Then the source names the stream, the Role and when reading started.
    const description = described.DeliveryStreamDescription;
    assertIdentical(description.DeliveryStreamType, "KinesisStreamAsSource");

    const source = description.Source?.KinesisStreamSourceDescription;
    assertNonNullable(source, "The delivery stream reports its source");
    assertIdentical(source.KinesisStreamARN, streamArn);
    assertIdentical(source.RoleARN, sourceRoleArn);
    assertIdentical(
      source.DeliveryStartTimestamp.getTime(),
      deliveryStream.createdAt.getTime(),
    );
  });

  it("reports no source for a delivery stream that takes puts", async () => {
    // Given a DirectPut delivery stream.
    const simAws = new SimAws();
    const { deliveryStream } = await makeFirehoseDelivery(simAws);

    // When it is described.
    const described = await simAws.firehose().describeDeliveryStream(
      new DescribeDeliveryStreamCommand({
        DeliveryStreamName: deliveryStream.name,
      }),
    );

    // Then it reports no source at all, which is what real Firehose reports
    // for a delivery stream nothing reads for.
    assertUndefined(described.DeliveryStreamDescription.Source);
  });

  it("reads once for records put before it got to them", async () => {
    // Given a delivery stream reading a stream, buffering for a minute.
    const simAws = new SimAws();
    const { bucketName, streamName } = await makeFirehoseKinesisSource(simAws, {
      intervalInSeconds: 60,
    });
    // When two records are put before simulated time moves at all.
    await putOrder(simAws, streamName, "order-1");
    await putOrder(simAws, streamName, "order-2");
    await simAws.clock().advanceBy({ seconds: 60 });

    // Then one read took both, and both are in the same Object. The second
    // record arrived while a read was already waiting to happen.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);
    assertIdentical(
      await deliveredObjectBody(simAws, bucketName, keys[0]),
      '{"id":"order-1"}\n{"id":"order-2"}\n',
    );
  });

  it("reads on past the most one call hands back", async () => {
    // Given a delivery stream reading a stream, and more records than one
    // GetRecords call answers with, which is ten thousand.
    const simAws = new SimAws();
    const { bucketName, streamName } = await makeFirehoseKinesisSource(simAws);
    const batchSize = 500;
    const batchCount = 21;

    // When every one of them is put onto the stream and the interval passes.
    await Promise.all(
      Array.from({ length: batchCount }, async (_unused, batch) =>
        simAws.kinesis().putRecords(
          new PutRecordsCommand({
            StreamName: streamName,
            Records: orderBatch(batch, batchSize),
          }),
        ),
      ),
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then every record arrived. A read that filled the request went round
    // again rather than waiting for the next put.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);

    const body = await deliveredObjectBody(simAws, bucketName, keys[0]);
    assertArrayLength(body.trimEnd().split("\n"), batchSize * batchCount);
  });
});
