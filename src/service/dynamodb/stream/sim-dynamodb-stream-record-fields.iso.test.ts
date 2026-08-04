import { PutItemCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertIdentical,
  assertSetSize,
  assertStringLength,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import { SimFixedClock } from "../../../util/clock/sim-clock.js";
import { simDynamoDbStreamedTableFactory } from "./sim-dynamodb-streamed-table.factory.js";

/**
 * The instant this test starts from.
 */
const startedAt = new Date("2026-08-04T09:00:00.000Z");

/**
 * Write an order onto the streamed table.
 */
async function putOrder(simAws: SimAws, orderId: string): Promise<void> {
  await simAws.dynamoDb().putItem(
    new PutItemCommand({
      TableName: "orders",
      Item: { orderId: { S: orderId } },
    }),
  );
}

describe("DynamoDB stream record numbering", () => {
  it("numbers records in order at one width, on the simulated clock", async () => {
    // Given several items written inside one millisecond of simulated time.
    const simAws = new SimAws({ clock: new SimFixedClock(startedAt) });
    const table = await simDynamoDbStreamedTableFactory.make({}, simAws);
    await simAws.clock().advanceBy({ hours: 1 });
    await Promise.all([
      putOrder(simAws, "order-1"),
      putOrder(simAws, "order-2"),
      putOrder(simAws, "order-3"),
    ]);

    // Then each record has its own sequence number, and the numbers sort the
    // same way as text and as numbers: a clock could not have told these apart
    // at all. What the clock does say is when the change happened.
    const records = table.stream.latest?.records ?? [];
    const numbers = records.map((record) => record.sequenceNumber);
    assertArrayLength(numbers, 3);
    assertSetSize(new Set(numbers), 3);

    for (const [position, number] of numbers.entries()) {
      assertStringLength(number, 21);
      assertTrue(position === 0 || number > (numbers[position - 1] ?? ""));
      assertIdentical(
        records.at(position)?.approximateCreationDateTime.toISOString(),
        "2026-08-04T10:00:00.000Z",
      );
    }
  });
});
