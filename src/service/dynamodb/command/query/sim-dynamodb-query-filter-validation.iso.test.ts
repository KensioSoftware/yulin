import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
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
 * A table keyed by customer and order, holding one order.
 */
async function ordersTable(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDbCollectionTableFactory.make({}, simAws);
  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "OrdersTable",
      Item: {
        customerId: { S: "c-1" },
        orderId: { S: "2026-01" },
        details: { M: { customerId: { S: "c-1" } } },
      },
    }),
  );

  return simDynamoDb;
}

/**
 * The key condition every one of these queries carries.
 */
const keyCondition = {
  TableName: "OrdersTable",
  KeyConditionExpression: "customerId = :customer",
};

describe("DynamoDB QueryCommand FilterExpression validation", () => {
  it.each([
    {
      name: "the partition key",
      filter: "customerId = :customer",
      names: undefined,
      refused: "customerId",
    },
    {
      name: "the sort key",
      filter: "orderId > :customer",
      names: undefined,
      refused: "orderId",
    },
    {
      name: "a key attribute written as a placeholder",
      filter: "#order > :customer",
      names: { "#order": "orderId" },
      refused: "orderId",
    },
    {
      name: "a key attribute measured by size",
      filter: "size(orderId) > :customer",
      names: undefined,
      refused: "orderId",
    },
    {
      name: "a path into a key attribute",
      filter: "customerId.name = :customer",
      names: undefined,
      refused: "customerId",
    },
  ])("refuses a query filter naming $name", async (example) => {
    // Given a table keyed by customer and order.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query filters by a key attribute.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          ...keyCondition,
          FilterExpression: example.filter,
          ExpressionAttributeNames: example.names,
          ExpressionAttributeValues: { ":customer": { S: "c-1" } },
        }),
      ),
    );

    // Then it is refused naming the key attribute, since a query narrows by
    // its key condition rather than by a filter.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, example.refused);
  });

  it("takes a filter naming an attribute inside a key attribute name", async () => {
    // Given a table holding an order carrying a map with a key attribute name
    // inside it.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query filters by that nested path.
    const output = await simDynamoDb.query(
      new QueryCommand({
        ...keyCondition,
        FilterExpression: "details.customerId = :customer",
        ExpressionAttributeValues: { ":customer": { S: "c-1" } },
      }),
    );

    // Then it is read rather than refused: the path starts at an attribute
    // outside the primary key.
    assertArrayLength(output.Items ?? [], 1);
  });

  it.each([
    { name: "an empty expression", filter: " " },
    { name: "a syntax error", filter: "status =" },
    { name: "a condition left incomplete", filter: "status = :customer AND" },
  ])("refuses $name in a query filter", async (example) => {
    // Given a table keyed by customer and order.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query carries a filter DynamoDB would not read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          ...keyCondition,
          FilterExpression: example.filter,
          ExpressionAttributeValues: { ":customer": { S: "c-1" } },
        }),
      ),
    );

    // Then the refusal names the parameter the expression arrived as.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(error.message, "FilterExpression");
  });
});
