import { QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayLength,
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { SimDynamoDbUnsupportedOperation } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

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

/**
 * The key condition every one of these queries carries.
 */
const keyCondition = {
  TableName: "OrdersTable",
  KeyConditionExpression: "customerId = :customer",
  ExpressionAttributeValues: { ":customer": { S: "c-1" } },
};

describe("DynamoDB QueryCommand unsimulated input", () => {
  it.each([
    {
      name: "ProjectionExpression",
      input: { ProjectionExpression: "orderId" },
    },
    { name: "AttributesToGet", input: { AttributesToGet: ["orderId"] } },
    {
      name: "KeyConditions",
      input: {
        KeyConditions: {
          customerId: {
            ComparisonOperator: "EQ",
            AttributeValueList: [{ S: "c-1" }],
          },
        },
      },
    },
    {
      name: "QueryFilter",
      input: {
        QueryFilter: {
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

    // When a query asks for something this simulation does not model.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query({ input: { ...keyCondition, ...example.input } }),
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

    // When a query asks for the capacity reporting it already does.
    const output = await simDynamoDb.query(
      new QueryCommand({ ...keyCondition, ReturnConsumedCapacity: "NONE" }),
    );

    // Then it is let through.
    assertArrayLength(output.Items ?? [], 0);
  });
});
