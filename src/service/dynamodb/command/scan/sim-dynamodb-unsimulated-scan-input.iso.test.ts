import { ScanCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEmpty,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";

/**
 * A table keyed by customer and order, holding nothing.
 *
 * These inputs are refused before the table is read, so there is nothing to
 * write.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);

  return simDynamoDb;
}

describe("DynamoDB ScanCommand unsimulated input", () => {
  it.each([
    {
      name: "ProjectionExpression",
      input: { ProjectionExpression: "orderId" },
    },
    { name: "AttributesToGet", input: { AttributesToGet: ["orderId"] } },
    {
      name: "ScanFilter",
      input: {
        ScanFilter: {
          status: {
            ComparisonOperator: "EQ",
            AttributeValueList: [{ S: "shipped" }],
          },
        },
      },
    },
    { name: "ConditionalOperator", input: { ConditionalOperator: "AND" } },
    {
      name: "ReturnConsumedCapacity",
      input: { ReturnConsumedCapacity: "TOTAL" },
    },
  ])("refuses $name by name", async (example) => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan asks for something this simulation does not model.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.scan({
        input: { TableName: "OrdersTable", ...example.input },
      }),
    );

    // Then it is refused by name rather than answered with a page that means
    // something else.
    assertInstanceOf(error, SimDynamoDbUnsupportedOperation);
    assertStringIncludes(error.message, example.name);
  });

  it("takes a ReturnConsumedCapacity of NONE", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a scan asks for the capacity reporting it already does.
    const output = await simDynamoDb.scan(
      new ScanCommand({
        TableName: "OrdersTable",
        ReturnConsumedCapacity: "NONE",
      }),
    );

    // Then it is let through.
    assertArrayEmpty(output.Items ?? []);
  });
});
