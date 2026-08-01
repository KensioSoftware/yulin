import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";

/**
 * A table keyed by customer and order, holding nothing.
 *
 * These divisions are refused before the table is read, so there is nothing to
 * write.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  return simDynamoDb;
}

describe("DynamoDB ScanCommand segment validation", () => {
  it("refuses a Segment with no TotalSegments", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan names the segment to read but not the division it belongs
    // to.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", Segment: 0 }),
      ),
    );

    // Then it is refused, since the share of the table it asks for cannot be
    // worked out.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "TotalSegments");
  });

  it("refuses a TotalSegments with no Segment", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan names the division but not which segment of it to read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({ TableName: "OrdersTable", TotalSegments: 4 }),
      ),
    );

    // Then it is refused rather than defaulted to a segment the caller never
    // named.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "Segment");
  });

  it.each([4, 5, -1])(
    "refuses a Segment of %s out of four",
    async (segment) => {
      // Given a table.
      const simAws = new SimAws();
      const simDynamoDb = await ordersTable(simAws);

      // When a scan names a segment the division does not have.
      const error = await assertThrowsErrorAsync(async () =>
        simDynamoDb.scan(
          new ScanCommand({
            TableName: "OrdersTable",
            Segment: segment,
            TotalSegments: 4,
          }),
        ),
      );

      // Then it is refused, since Segment is zero based and below
      // TotalSegments.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "Segment");
    },
  );

  it.each([0, 1_000_001])(
    "refuses a TotalSegments of %s",
    async (totalSegments) => {
      // Given a table.
      const simAws = new SimAws();
      const simDynamoDb = await ordersTable(simAws);

      // When a scan divides the table into a number of segments outside the
      // range AWS takes.
      const error = await assertThrowsErrorAsync(async () =>
        simDynamoDb.scan(
          new ScanCommand({
            TableName: "OrdersTable",
            Segment: 0,
            TotalSegments: totalSegments,
          }),
        ),
      );

      // Then it is refused.
      assertInstanceOf(error, SimDynamoDbValidationException);
      assertStringIncludes(error.message, "TotalSegments");
    },
  );

  it("refuses a division before it reads the table", async () => {
    // Given a simulated DynamoDB holding no such table.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    // When a scan of a table that is not there names a segment that is not
    // there either.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan(
        new ScanCommand({
          TableName: "MissingTable",
          Segment: 9,
          TotalSegments: 4,
        }),
      ),
    );

    // Then the division is what it is refused for. A request DynamoDB would
    // not take is refused whether or not the table is there.
    assertInstanceOf(error, SimDynamoDbValidationException);
  });

  it.each([1, 1_000_000])(
    "takes a TotalSegments of %s",
    async (totalSegments) => {
      // Given a table.
      const simAws = new SimAws();
      const simDynamoDb = await ordersTable(simAws);

      // When a scan divides it at either end of the range.
      const output = await simDynamoDb.scan(
        new ScanCommand({
          TableName: "OrdersTable",
          Segment: 0,
          TotalSegments: totalSegments,
        }),
      );

      // Then it is read, and holds nothing since the table does.
      assertArrayLength(output.Items ?? [], 0);
    },
  );
});
