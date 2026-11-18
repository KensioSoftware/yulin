import { QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEmpty,
  assertIdentical,
  assertInstanceOf,
  assertObjectEquals,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbCollectionTableFactory } from "../../table/sim-dynamodb-collection-table.factory.js";
import { SimDynamoDbValidationException } from "../../error/dynamodb.error.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";
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

describe("DynamoDB QueryCommand input", () => {
  it("reads with KeyConditions, QueryFilter and AttributesToGet", async () => {
    // Given a table holding a customer's open and shipped orders.
    const simAws = new SimAws();
    await simDynamoDbStockedTableFactory.make(
      { customerCount: 2, orderCount: 2 },
      simAws,
    );

    // When a query reads one customer the legacy way.
    const output = await simAws.dynamoDb().query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditions: {
          customerId: {
            ComparisonOperator: "EQ",
            AttributeValueList: [{ S: "c-1" }],
          },
          orderId: {
            ComparisonOperator: "BEGINS_WITH",
            AttributeValueList: [{ S: "2026" }],
          },
        },
        QueryFilter: {
          status: {
            ComparisonOperator: "EQ",
            AttributeValueList: [{ S: "OPEN" }],
          },
        },
        AttributesToGet: ["orderId"],
      }),
    );

    // Then it answers with that customer's open order, cut down to its id.
    assertObjectEquals(output.Items, [{ orderId: { S: "2026-01" } }]);
    assertIdentical(output.ScannedCount, 2);
  });

  it("refuses a key condition no index can answer", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a legacy key condition compares the partition key with NE.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query({
        input: {
          TableName: "OrdersTable",
          KeyConditions: {
            customerId: {
              ComparisonOperator: "NE",
              AttributeValueList: [{ S: "c-1" }],
            },
          },
        },
      }),
    );

    // Then it is refused the way AWS refuses it.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Attempted conditional constraint is not an indexable operation",
    );
  });

  it("refuses AttributesToGet alongside a KeyConditionExpression", async () => {
    // Given a table.
    const simAws = new SimAws();
    const simDynamoDb = await ordersTable(simAws);

    // When a query mixes a legacy parameter with an expression.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query({
        input: { ...keyCondition, AttributesToGet: ["orderId"] },
      }),
    );

    // Then it is refused, naming both.
    assertInstanceOf(error, SimDynamoDbValidationException);
    assertStringIncludes(
      error.message,
      "Non-expression parameters: {AttributesToGet} Expression parameters: " +
        "{KeyConditionExpression}",
    );
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
    assertArrayEmpty(output.Items ?? []);
  });
});
