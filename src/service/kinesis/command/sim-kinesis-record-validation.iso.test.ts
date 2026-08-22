import { PutRecordCommand, PutRecordsCommand } from "@aws-sdk/client-kinesis";
import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimKinesisInvalidArgumentException } from "../error/sim-kinesis.error.js";
import { simKinesisMaxRecordBytes } from "./record/sim-kinesis-put-entry.js";
import { simKinesisStreamFactory } from "../stream/sim-kinesis-stream.factory.js";

/**
 * The error a call raised, as the assertions here want it.
 */
async function refusalFrom(
  call: () => Promise<unknown>,
): Promise<SimKinesisInvalidArgumentException> {
  const error = await assertThrowsErrorAsync(call);
  assertInstanceOf(error, SimKinesisInvalidArgumentException);

  return error;
}

describe("What simulated Kinesis refuses of a record request", () => {
  it("refuses a record with no partition key", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a record is put with an empty partition key.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "",
          Data: new TextEncoder().encode("order-1"),
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "PartitionKey is required");
  });

  it("refuses a partition key longer than Kinesis accepts", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a record is put under a partition key of 257 characters.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "c".repeat(257),
          Data: new TextEncoder().encode("order-1"),
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "256 characters");
  });

  it("refuses a record with no data", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a record is put with no data. The SDK requires it, so the request is
    // made structurally.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecord({
        input: { StreamName: "orders", PartitionKey: "customer-1" },
      });
    });

    // Then it is refused.
    assertStringIncludes(error.message, "Data is required");
  });

  it("refuses a record larger than Kinesis accepts", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a record over a megabyte is put.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "customer-1",
          Data: new Uint8Array(simKinesisMaxRecordBytes + 1),
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "in one record");
  });

  it("refuses an explicit hash key outside the hash key space", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a record is put with a negative explicit hash key.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "customer-1",
          ExplicitHashKey: "-1",
          Data: new TextEncoder().encode("order-1"),
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "hash key space");
  });

  it("refuses an explicit hash key that is not a number", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a record is put with a hash key that is not a number.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecord(
        new PutRecordCommand({
          StreamName: "orders",
          PartitionKey: "customer-1",
          ExplicitHashKey: "half way",
          Data: new TextEncoder().encode("order-1"),
        }),
      );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "not a whole number");
  });

  it("refuses an empty batch", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When a batch with no records in it is put.
    const error = await refusalFrom(async () => {
      await simAws
        .kinesis()
        .putRecords(
          new PutRecordsCommand({ StreamName: "orders", Records: [] }),
        );
    });

    // Then it is refused.
    assertStringIncludes(error.message, "at least one record");
  });

  it("refuses a batch of more records than Kinesis takes at once", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When five hundred and one records are put in one batch.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecords(
        new PutRecordsCommand({
          StreamName: "orders",
          Records: Array.from({ length: 501 }, (_unused, index) => ({
            PartitionKey: `customer-${index}`,
            Data: new TextEncoder().encode("order"),
          })),
        }),
      );
    });

    // Then the whole request is refused, rather than the records past the limit.
    assertStringIncludes(error.message, "501 records");
  });

  it("refuses a batch of more bytes than Kinesis takes at once", async () => {
    // Given a stream.
    const simAws = new SimAws();
    await simKinesisStreamFactory.make({}, simAws);

    // When six records of a megabyte each are put in one batch.
    const error = await refusalFrom(async () => {
      await simAws.kinesis().putRecords(
        new PutRecordsCommand({
          StreamName: "orders",
          Records: Array.from({ length: 6 }, (_unused, index) => ({
            PartitionKey: `customer-${index}`,
            Data: new Uint8Array(simKinesisMaxRecordBytes),
          })),
        }),
      );
    });

    // Then the whole request is refused.
    assertStringIncludes(error.message, "in one request");
  });
});
