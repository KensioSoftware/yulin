import {
  PutRecordBatchCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringLength,
  assertStringMatches,
  assertStringStartsWith,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  deliveredObjectBody,
  deliveredObjectKeys,
  makeFirehoseDelivery,
} from "../../../../test/firehose/firehose-delivery-fixture.js";
import { SimAws } from "../../aws/sim-aws.js";

/**
 * The bytes of one JSON line, the way a Firehose producer writes one.
 */
function orderLine(id: string): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify({ id })}\n`);
}

/**
 * Assert an Object key is the one Firehose would have written.
 */
function assertKeyMatches(key: string | undefined, pattern: RegExp): void {
  assertNonNullable(key, "An Object was delivered under a key");
  assertStringMatches(key, pattern);
}

describe("Delivering simulated Firehose records into S3", () => {
  it("writes a record to the Bucket once the buffering interval passes", async () => {
    // Given a delivery stream buffering for a minute into a Bucket.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws, {
      intervalInSeconds: 60,
    });

    // When a record is put and the interval has yet to pass.
    await simAws.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: orderLine("order-1") },
      }),
    );
    await simAws.clock().advanceBy({ seconds: 30 });

    // Then nothing has been delivered yet.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 0);

    // When the clock passes the interval.
    await simAws.clock().advanceBy({ seconds: 31 });

    // Then the record is in the Bucket, under a key carrying the UTC date path
    // and the delivery stream name.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);
    assertKeyMatches(
      keys[0],
      /^\d{4}\/\d{2}\/\d{2}\/\d{2}\/order-events-1-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}-[\da-f-]{36}$/,
    );
  });

  it("delivers records buffered together as one Object", async () => {
    // Given a delivery stream buffering for a minute.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws);
    const firehose = simAws.firehose();

    // When three records are put inside one buffering window.
    await firehose.putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: orderLine("order-1") },
      }),
    );
    await firehose.putRecordBatch(
      new PutRecordBatchCommand({
        DeliveryStreamName: "order-events",
        Records: [
          { Data: orderLine("order-2") },
          { Data: orderLine("order-3") },
        ],
      }),
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then one Object holds all three, concatenated in the order they were put.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);

    assertIdentical(
      await deliveredObjectBody(simAws, bucketName, keys[0]),
      '{"id":"order-1"}\n{"id":"order-2"}\n{"id":"order-3"}\n',
    );
  });

  it("puts the declared prefix in front of the date path", async () => {
    // Given a delivery stream with a Prefix.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws, {
      prefix: "orders/raw/",
    });

    // When a record is put and the interval passes.
    await simAws.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: orderLine("order-1") },
      }),
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then the key starts with the prefix, and the date path follows it.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);
    assertStringStartsWith(keys[0], "orders/raw/");
    assertKeyMatches(keys[0], /^orders\/raw\/\d{4}\/\d{2}\/\d{2}\/\d{2}\//);
  });

  it("starts a new buffer after one is delivered", async () => {
    // Given a delivery stream that has already delivered a buffer.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws);
    const firehose = simAws.firehose();

    await firehose.putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: orderLine("order-1") },
      }),
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // When another record is put and another interval passes.
    await firehose.putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: orderLine("order-2") },
      }),
    );
    await simAws.clock().advanceBy({ minutes: 2 });

    // Then it arrives as a second Object holding only itself.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 2);

    assertIdentical(
      await deliveredObjectBody(simAws, bucketName, keys[1]),
      '{"id":"order-2"}\n',
    );
  });

  it("delivers nothing for an interval that took no records", async () => {
    // Given a delivery stream nothing has been put onto.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws);

    // When several buffering intervals pass.
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then no Object was written. Real Firehose writes one per buffer, and an
    // empty interval is no buffer.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 0);
  });

  it("delivers a full buffer without waiting for the interval", async () => {
    // Given a delivery stream whose buffer delivers at one megabyte, and an
    // interval far longer than the test will run for.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws, {
      sizeInMegabytes: 1,
      intervalInSeconds: 900,
    });

    // When more than a megabyte is put onto it, in records under the size
    // limit Firehose puts on one.
    await simAws.firehose().putRecordBatch(
      new PutRecordBatchCommand({
        DeliveryStreamName: "order-events",
        Records: [
          { Data: new Uint8Array(600_000) },
          { Data: new Uint8Array(600_000) },
        ],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then the buffer was delivered on the size bound, with the clock standing
    // still.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 1);
  });

  it("stops delivering once the delivery stream is deleted", async () => {
    // Given a delivery stream holding a record it has yet to deliver.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws);
    const firehose = simAws.firehose();

    await firehose.putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: orderLine("order-1") },
      }),
    );

    // When the delivery stream is deleted before the interval passes.
    await firehose.deleteDeliveryStream({
      input: { DeliveryStreamName: "order-events" },
    });
    await simAws.clock().advanceBy({ minutes: 10 });

    // Then nothing was written. An Object naming a delivery stream that has
    // gone is nothing a test could expect.
    assertArrayLength(await deliveredObjectKeys(simAws, bucketName), 0);
  });

  it("writes one Object when two records each fill the buffer", async () => {
    // Given a delivery stream whose buffer delivers at one megabyte.
    const simAws = new SimAws();
    const { bucketName } = await makeFirehoseDelivery(simAws, {
      sizeInMegabytes: 1,
      intervalInSeconds: 900,
    });
    const firehose = simAws.firehose();
    const megabyte = new Uint8Array(1000 * 1024);

    // When two records that each fill it are put before either delivery runs.
    await firehose.putRecordBatch(
      new PutRecordBatchCommand({
        DeliveryStreamName: "order-events",
        Records: [{ Data: megabyte }, { Data: megabyte }, { Data: megabyte }],
      }),
    );
    await simAws.backgroundTasksComplete();

    // Then one Object holds all of it. The second delivery found the buffer
    // the first had already taken, and wrote nothing rather than an empty
    // Object.
    const keys = await deliveredObjectKeys(simAws, bucketName);
    assertArrayLength(keys, 1);
    const body = await deliveredObjectBody(simAws, bucketName, keys[0]);
    assertStringLength(body, 3 * 1000 * 1024);
  });
});
