import {
  PutRecordBatchCommand,
  PutRecordCommand,
} from "@aws-sdk/client-firehose";
import { CreateBucketCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUuidV4,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimFirehoseInvalidArgumentException } from "../../error/sim-firehose.error.js";
import { simFirehoseDeliveryStreamFactory } from "../../stream/sim-firehose-delivery-stream.factory.js";

/**
 * A simulated AWS with a Bucket and a delivery stream writing into it.
 */
async function simAwsWithDeliveryStream(): Promise<SimAws> {
  const simAws = new SimAws();

  await simAws
    .s3()
    .createBucket(new CreateBucketCommand({ Bucket: "order-archive" }));
  await simFirehoseDeliveryStreamFactory.make({}, simAws);

  return simAws;
}

describe("What a simulated Firehose put takes", () => {
  it("answers a put with a record id", async () => {
    // Given a delivery stream.
    const simAws = await simAwsWithDeliveryStream();

    // When a record is put.
    const output = await simAws.firehose().putRecord(
      new PutRecordCommand({
        DeliveryStreamName: "order-events",
        Record: { Data: new TextEncoder().encode("one") },
      }),
    );

    // Then the record has an id, and the delivery stream is not encrypted.
    assertUuidV4(output.RecordId);
    assertFalse(output.Encrypted);
  });

  it("answers a batch with one id per record", async () => {
    // Given a delivery stream.
    const simAws = await simAwsWithDeliveryStream();

    // When three records are put in one request.
    const output = await simAws.firehose().putRecordBatch(
      new PutRecordBatchCommand({
        DeliveryStreamName: "order-events",
        Records: [{ Data: new Uint8Array([1]) }, { Data: new Uint8Array([2]) }],
      }),
    );

    // Then every one of them was taken. Nothing here throttles, so no record
    // in an accepted batch fails.
    assertIdentical(output.FailedPutCount, 0);
    assertArrayLength(output.RequestResponses, 2);

    const [first] = output.RequestResponses;
    assertNonNullable(first, "The first record has a response entry");
    assertUuidV4(first.RecordId);
  });

  it("refuses a record carrying no data", async () => {
    const simAws = await simAwsWithDeliveryStream();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws
        .firehose()
        .putRecord({ input: { DeliveryStreamName: "order-events" } });
    });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "no Data");
  });

  it("refuses a record over the size Firehose takes", async () => {
    const simAws = await simAwsWithDeliveryStream();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecord(
        new PutRecordCommand({
          DeliveryStreamName: "order-events",
          Record: { Data: new Uint8Array(1000 * 1024 + 1) },
        }),
      );
    });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "1024000 bytes");
  });

  it("names the record a batch was refused for", async () => {
    const simAws = await simAwsWithDeliveryStream();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecordBatch(
        new PutRecordBatchCommand({
          DeliveryStreamName: "order-events",
          Records: [{ Data: new Uint8Array([1]) }, { Data: undefined }],
        }),
      );
    });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "at index 1");
  });

  it("refuses an empty batch", async () => {
    const simAws = await simAwsWithDeliveryStream();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecordBatch(
        new PutRecordBatchCommand({
          DeliveryStreamName: "order-events",
          Records: [],
        }),
      );
    });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "at least one record");
  });

  it("refuses a batch over the record count Firehose takes", async () => {
    const simAws = await simAwsWithDeliveryStream();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecordBatch(
        new PutRecordBatchCommand({
          DeliveryStreamName: "order-events",
          Records: Array.from({ length: 501 }, () => ({
            Data: new Uint8Array([1]),
          })),
        }),
      );
    });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "501 records");
  });

  it("refuses a batch over the size Firehose takes", async () => {
    const simAws = await simAwsWithDeliveryStream();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecordBatch(
        new PutRecordBatchCommand({
          DeliveryStreamName: "order-events",
          Records: Array.from({ length: 5 }, () => ({
            Data: new Uint8Array(1000 * 1024),
          })),
        }),
      );
    });

    assertInstanceOf(error, SimFirehoseInvalidArgumentException);
    assertStringIncludes(error.message, "over the 4194304");
  });

  it("refuses a put onto a delivery stream that is not there", async () => {
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.firehose().putRecord(
        new PutRecordCommand({
          DeliveryStreamName: "order-events",
          Record: { Data: new Uint8Array([1]) },
        }),
      );
    });

    assertIdentical(error.name, "ResourceNotFoundException");
  });
});
