import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertSetSize,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../aws/sim-aws.js";
import type { SimScanCommandOutput } from "../command/scan/scan.command.js";
import {
  SimDynamoDbResourceNotFoundException,
  SimDynamoDbValidationException,
} from "../error/dynamodb.error.js";
import { simDynamoDbIndexedTableFactory } from "./sim-dynamodb-indexed-table.factory.js";

/**
 * The order ids a scanned page came back with.
 */
function scannedIds(page: SimScanCommandOutput): readonly string[] {
  return (page.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB Scan of a global secondary index", () => {
  it("reads the items the index holds rather than the whole table", async () => {
    // Given a table of six orders, two of which carry no status.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);
    const dynamoDb = simAws.dynamoDb();

    // When the index and the table are each scanned.
    const index = await dynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable", IndexName: "byStatus" }),
    );
    const table = await dynamoDb.scan(
      new ScanCommand({ TableName: "OrdersTable" }),
    );

    // Then the index scan is short by the orders it does not hold.
    assertIdentical(table.Count, 6);
    assertIdentical(index.Count, 4);
  });

  it("answers with what the index projects", async () => {
    // Given a table whose index carries only its keys.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make(
      { projectionType: "KEYS_ONLY" },
      simAws,
    );

    // When the index is scanned.
    const page = await simAws
      .dynamoDb()
      .scan({ input: { TableName: "OrdersTable", IndexName: "byStatus" } });

    // Then each item is cut to the keys, the same way a query of it is.
    const item = page.Items?.[0] ?? {};
    assertUndefined(item["title"]);
    assertNonNullable(item["status"]);
  });

  it("pages an index scan by both keys", async () => {
    // Given a table with an index holding four orders.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);
    const dynamoDb = simAws.dynamoDb();

    // When three are scanned off the index and the rest resumed after them.
    const first = await dynamoDb.scan({
      input: { TableName: "OrdersTable", IndexName: "byStatus", Limit: 3 },
    });
    const second = await dynamoDb.scan({
      input: {
        TableName: "OrdersTable",
        IndexName: "byStatus",
        Limit: 3,
        ExclusiveStartKey: first.LastEvaluatedKey,
      },
    });

    // Then every item the index holds comes back once. The token carries the
    // index key and the table key, so it names one entry rather than several.
    const found = new Set([...scannedIds(first), ...scannedIds(second)]);
    assertSetSize(found, 4);
  });

  it("refuses an index name the table does not have", async () => {
    // Given a table with one index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a scan names an index that is not there.
    const error = await assertThrowsErrorAsync(async () =>
      simAws
        .dynamoDb()
        .scan({ input: { TableName: "OrdersTable", IndexName: "byOwner" } }),
    );

    // Then it is refused rather than read as the table.
    assertInstanceOf(error, SimDynamoDbResourceNotFoundException);
    assertStringIncludes(error.message, "does not have the specified index");
  });

  it("refuses a consistent scan of a global secondary index", async () => {
    // Given a table with an index.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);

    // When a scan asks for a strongly consistent read of it.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.dynamoDb().scan({
        input: {
          TableName: "OrdersTable",
          IndexName: "byStatus",
          ConsistentRead: true,
        },
      }),
    );

    // Then it is refused, the same way a query of it is.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Consistent reads are not supported on global secondary indexes",
    );
  });

  it("divides an index scan into parallel segments", async () => {
    // Given a table with an index holding two status values.
    const simAws = new SimAws();
    await simDynamoDbIndexedTableFactory.make({}, simAws);
    const dynamoDb = simAws.dynamoDb();

    // When the index is scanned in two segments.
    const segments = await Promise.all(
      [0, 1].map(async (index) =>
        dynamoDb.scan({
          input: {
            TableName: "OrdersTable",
            IndexName: "byStatus",
            Segment: index,
            TotalSegments: 2,
          },
        }),
      ),
    );

    // Then between them they cover the index once. The segments divide by the
    // index partition key rather than the table's, so an item collection of
    // the index stays together.
    const found = new Set(segments.flatMap((segment) => scannedIds(segment)));
    assertSetSize(found, 4);
  });
});
