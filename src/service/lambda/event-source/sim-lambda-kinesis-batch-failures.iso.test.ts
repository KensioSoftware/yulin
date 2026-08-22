import { PutRecordsCommand } from "@aws-sdk/client-kinesis";
import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithKinesisEventSource } from "../../../../test/lambda/kinesis-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type {
  SimLambdaKinesisStreamEvent,
  SimLambdaKinesisStreamEventRecord,
} from "./poll/kinesis/sim-lambda-kinesis-stream-event.types.js";

/**
 * The orders one batch carries.
 */
const orderIds = ["order-1", "order-2", "order-3"];

/**
 * The whole batch, as one delivery of it reads.
 */
const wholeBatch = orderIds.join(", ");

/**
 * What one report entry names, which is a sequence number for a stream.
 */
interface BatchItemFailure {
  readonly itemIdentifier: unknown;
}

/**
 * The order one delivered record carried.
 */
function orderIn(record: SimLambdaKinesisStreamEventRecord): string {
  return Buffer.from(record.kinesis.data, "base64").toString("utf8");
}

/**
 * What each delivery carried, as a line per delivery.
 */
function deliveries(
  events: readonly SimLambdaKinesisStreamEvent[],
): readonly string[] {
  return events.map((event) =>
    event.Records.map((record) => orderIn(record)).join(", "),
  );
}

/**
 * A handler reporting a batch item failure the first time it is given the
 * batch, and handling everything it is given after that.
 *
 * The retry is the interesting part of every test here, so the failure has to
 * stop: a handler that always reported would be delivered the same records
 * until the mapping gave up on them.
 */
function reportingOnce(
  failures: (event: SimLambdaKinesisStreamEvent) => readonly BatchItemFailure[],
): (event: SimLambdaKinesisStreamEvent) => unknown {
  let reported = false;

  return (event: SimLambdaKinesisStreamEvent): unknown => {
    if (reported) {
      return undefined;
    }

    reported = true;

    return { batchItemFailures: failures(event) };
  };
}

/**
 * Put the batch onto one shard, by giving every record one partition key, and
 * let the mapping get through its first delivery and the retry after it.
 *
 * The retry waits a second on the simulation's clock, so advancing time is what
 * brings the failed batch back.
 */
async function putBatch(simAws: SimAws): Promise<void> {
  await simAws.kinesis().putRecords(
    new PutRecordsCommand({
      StreamName: "orders",
      Records: orderIds.map((orderId) => ({
        PartitionKey: "customer-1",
        Data: new TextEncoder().encode(orderId),
      })),
    }),
  );
  await simAws.backgroundTasksComplete();
  await simAws.clock().advanceBy({ seconds: 1 });
}

describe("sim Lambda Kinesis stream batch item failures", () => {
  it("goes back to the record a report names", async () => {
    // Given a mapping expecting a failure report, whose handler reports the
    // second record of its first batch.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce((event) => [
        { itemIdentifier: event.Records[1]?.kinesis.sequenceNumber },
      ]),
    });

    // When a batch of three records is put onto one shard.
    await putBatch(simAws);

    // Then the batch went over again from the record the report named, so the
    // record after it was delivered a second time even though the function did
    // not name it.
    assertArrayEquals(deliveries(events), [wholeBatch, "order-2, order-3"]);
  });

  it("goes back to the lowest record of several a report names", async () => {
    // Given a handler reporting the last two records, out of order.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce((event) => [
        { itemIdentifier: event.Records[2]?.kinesis.sequenceNumber },
        { itemIdentifier: event.Records[1]?.kinesis.sequenceNumber },
      ]),
    });

    // When the batch is put.
    await putBatch(simAws);

    // Then reading went back to the earlier of the two.
    assertArrayEquals(deliveries(events), [wholeBatch, "order-2, order-3"]);
  });

  it("takes the whole batch back for a report naming a record it did not hold", async () => {
    // Given a handler reporting a sequence number that was not in the batch.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce(() => [{ itemIdentifier: "1" }]),
    });

    // When the batch is put.
    await putBatch(simAws);

    // Then the whole batch went over again, rather than guessing which record
    // was meant. Guessing wrong on a stream skips records.
    assertArrayEquals(deliveries(events), [wholeBatch, wholeBatch]);
  });

  it("ignores a report from a mapping that was not told to expect one", async () => {
    // Given a mapping with no ReportBatchItemFailures, whose handler reports
    // one anyway.
    const { simAws, events } = await simAwsWithKinesisEventSource({
      handlerResult: reportingOnce((event) => [
        { itemIdentifier: event.Records[1]?.kinesis.sequenceNumber },
      ]),
    });

    // When the batch is put.
    await putBatch(simAws);

    // Then the batch counts as handled, since nothing was reading the report.
    assertArrayLength(events, 1);
    assertArrayEquals(deliveries(events), [wholeBatch]);
  });
});
