import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertInstanceOf,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";
import type { SimDynamoDbAttributeValue } from "../item/item.types.js";
import type { SimScanCommandOutput } from "./scan.command.js";

/**
 * A table holding two orders for each of twenty customers.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  await simDynamoDbStockedTableFactory.make({ customerCount: 20 }, simAws);

  return simAws.dynamoDb();
}

/**
 * Each item of a page, as the pair of key values that names it.
 */
function keysOf(output: SimScanCommandOutput): readonly string[] {
  return (output.Items ?? []).map(
    (item) => `${item["customerId"]?.S ?? ""}/${item["orderId"]?.S ?? ""}`,
  );
}

/**
 * Read one segment of a table, a page at a time.
 */
async function pagedSegment(
  simDynamoDb: SimDynamoDb,
  segment: number,
  totalSegments: number,
  limit: number,
): Promise<readonly string[]> {
  const read: string[] = [];
  let exclusiveStartKey: Record<string, SimDynamoDbAttributeValue> | undefined;

  do {
    // eslint-disable-next-line no-await-in-loop -- a page at a time is the point.
    const page = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        Segment: segment,
        TotalSegments: totalSegments,
        Limit: limit,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    read.push(...keysOf(page));
    exclusiveStartKey = page.LastEvaluatedKey;
  } while (exclusiveStartKey !== undefined);

  return read;
}

describe("DynamoDB ScanCommand segment paging", () => {
  it("resumes a page on the same segment", async () => {
    // Given a table holding forty items.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When one segment is read a page at a time, and again in one go.
    const paged = await pagedSegment(simDynamoDb, 1, 4, 3);
    const whole = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        Segment: 1,
        TotalSegments: 4,
      }),
    );

    // Then the pages together are that segment, and nothing from another
    // segment came back with them.
    assertArrayEquals(paged, keysOf(whole));
  });

  it("refuses an ExclusiveStartKey from another segment", async () => {
    // Given the token one segment of a division handed out.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    const page = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        Segment: 0,
        TotalSegments: 4,
        Limit: 1,
      }),
    );
    const token = page.LastEvaluatedKey;
    assertNonNullable(token);

    // When another segment of the same division resumes from it.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({
          TableName: "OrdersTable",
          Segment: 1,
          TotalSegments: 4,
          ExclusiveStartKey: token,
        }),
      ),
    );

    // Then it is refused, since the token names a place that segment's walk
    // never reaches.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Segment 1 of 4");
  });
});
