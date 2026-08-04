import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import { assertArrayEquals, assertArrayLength } from "@kensio/smartass";
import { describe, it } from "vitest";

import { simAwsWithStreamEventSource } from "../../../../test/lambda/stream-event-source-fixture.js";
import type { SimAws } from "../../aws/sim-aws.js";
import type {
  SimLambdaDynamoDbStreamEvent,
  SimLambdaDynamoDbStreamEventRecord,
} from "./poll/sim-lambda-dynamodb-stream-event.types.js";

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
 * A handler reporting a batch item failure the first time it is given the
 * batch, and handling everything it is given after that.
 *
 * The retry is the interesting part of every test here, so the failure has to
 * stop: a handler that always reports would be delivered the same records until
 * the mapping gives up on them.
 */
function reportingOnce(
  failures: (
    event: SimLambdaDynamoDbStreamEvent,
  ) => readonly BatchItemFailure[],
): (event: SimLambdaDynamoDbStreamEvent) => unknown {
  let reported = false;

  return (event: SimLambdaDynamoDbStreamEvent): unknown => {
    if (reported) {
      return { batchItemFailures: [] };
    }

    reported = true;

    return { batchItemFailures: failures(event) };
  };
}

/**
 * The sequence number of the record for one order in a batch.
 */
function sequenceNumberOf(
  event: SimLambdaDynamoDbStreamEvent,
  orderId: string,
): string {
  return (
    event.Records.find((record) => orderIdOf(record) === orderId)?.dynamodb
      .SequenceNumber ?? ""
  );
}

function orderIdOf(record: SimLambdaDynamoDbStreamEventRecord): string {
  return record.dynamodb.Keys?.["orderId"]?.S ?? "";
}

/**
 * The orders each delivery carried, one line per delivery, in the order they
 * were delivered.
 */
function deliveries(events: readonly SimLambdaDynamoDbStreamEvent[]): string[] {
  return events.map((event) =>
    event.Records.map((record) => orderIdOf(record)).join(", "),
  );
}

/**
 * Write the batch's orders to the table at once, so one poll reads them all.
 */
async function writeOrders(simAws: SimAws, tableName: string): Promise<void> {
  await Promise.all(
    orderIds.map(async (orderId) =>
      simAws.dynamoDb().putItem(
        new PutItemCommand({
          TableName: tableName,
          Item: { orderId: { S: orderId } },
        }),
      ),
    ),
  );
  await simAws.backgroundTasksComplete();
}

describe("sim Lambda DynamoDB stream batch item failure reports", () => {
  it("delivers only the last record again when the report names it", async () => {
    // Given a stream mapping whose function reports its own batch item
    // failures, and a handler failing on the last record of the batch.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce((event) => [
        { itemIdentifier: sequenceNumberOf(event, "order-3") },
      ]),
    });

    // When the batch is delivered and the mapping tries the report again.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then only the record it named went over again.
    assertArrayEquals(deliveries(events), [wholeBatch, "order-3"]);
  });

  it("delivers a named record and everything after it, including what succeeded", async () => {
    // Given a handler failing on the first record of the batch.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce((event) => [
        { itemIdentifier: sequenceNumberOf(event, "order-1") },
      ]),
    });

    // When the batch is delivered and the mapping tries the report again.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then reading went back to that record and everything from there was
    // delivered again, including the two records the handler did handle. That
    // is a checkpoint rewind rather than a set of records taken back, and it is
    // why a stream consumer has to be idempotent.
    assertArrayEquals(deliveries(events), [wholeBatch, wholeBatch]);
  });

  it("takes an empty report as the whole batch handled", async () => {
    // Given a handler reporting no failures.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: (): unknown => ({ batchItemFailures: [] }),
    });

    // When the batch is delivered and time passes.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ seconds: 30 });

    // Then nothing went over again.
    assertArrayLength(events, 1);
  });

  it("delivers the whole batch again for a report naming nothing", async () => {
    // Given a handler reporting an entry with no sequence number on it.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce(() => [{ itemIdentifier: null }]),
    });

    // When the batch is delivered and the mapping tries the report again.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the whole batch went over again, as real Lambda does with a report
    // it cannot trust.
    assertArrayEquals(deliveries(events), [wholeBatch, wholeBatch]);
  });

  it("delivers the whole batch again for a report naming a record outside it", async () => {
    // Given a handler naming a sequence number that was not in the batch.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: reportingOnce(() => [
        { itemIdentifier: "100000000000000009999" },
      ]),
    });

    // When the batch is delivered and the mapping tries the report again.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ seconds: 1 });

    // Then the whole batch went over again rather than the mapping guessing
    // which record was meant.
    assertArrayEquals(deliveries(events), [wholeBatch, wholeBatch]);
  });

  it("ignores a report from a mapping that was not told to expect one", async () => {
    // Given a mapping created without FunctionResponseTypes, whose handler
    // reports a failure anyway.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      handlerResult: reportingOnce((event) => [
        { itemIdentifier: sequenceNumberOf(event, "order-1") },
      ]),
    });

    // When the batch is delivered and time passes.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ seconds: 30 });

    // Then the report was ignored and the batch is finished with, as it is on
    // real Lambda.
    assertArrayLength(events, 1);
  });

  it("gives up on a batch the report keeps naming rather than rewinding forever", async () => {
    // Given a handler that always reports the same record.
    const { simAws, tableName, events } = await simAwsWithStreamEventSource({
      functionResponseTypes: ["ReportBatchItemFailures"],
      handlerResult: (event): unknown => ({
        batchItemFailures: [
          { itemIdentifier: sequenceNumberOf(event, "order-2") },
        ],
      }),
    });

    // When an hour of simulated time passes.
    await writeOrders(simAws, tableName);
    await simAws.clock().advanceBy({ hours: 1 });

    // Then the records from the one it named were delivered five more times,
    // after 1, 2, 4, 8 and 16 seconds, and then discarded. A report counts
    // against the same attempts a failing batch does.
    assertArrayEquals(deliveries(events), [
      wholeBatch,
      "order-2, order-3",
      "order-2, order-3",
      "order-2, order-3",
      "order-2, order-3",
      "order-2, order-3",
    ]);
  });
});
