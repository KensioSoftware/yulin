import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";
import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { simDynamoDbStockedTableFactory } from "../../table/sim-dynamodb-stocked-table.factory.js";
import type { SimQueryCommandOutput } from "./query.command.js";

/**
 * The sort keys a page came back with, in the order they came back in.
 */
function orderIds(output: SimQueryCommandOutput): readonly string[] {
  return (output.Items ?? []).map((item) => item["orderId"]?.S ?? "");
}

describe("DynamoDB QueryCommand FilterExpression", () => {
  it("drops the items the filter does not hold for", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When the collection is read with a filter on an attribute outside the
    // key.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":open": { S: "OPEN" },
        },
      }),
    );

    // Then only the items the filter kept come back.
    assertArrayEquals(orderIds(output), ["2026-01", "2026-03"]);
  });

  it("counts what it evaluated apart from what it answered with", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When the collection is read with a filter.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":open": { S: "OPEN" },
        },
      }),
    );

    // Then ScannedCount is what the read evaluated and Count what survived the
    // filter. A filter saves nothing: every item it dropped was read.
    assertIdentical(output.ScannedCount, 4);
    assertIdentical(output.Count, 2);
  });

  it("applies the filter after the Limit rather than before it", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When a page of two items is read with a filter.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":open": { S: "OPEN" },
        },
        Limit: 2,
      }),
    );

    // Then the limit cut the read at two items and the filter dropped one of
    // them, so a Count below the Limit says nothing about there being more to
    // read.
    assertIdentical(output.ScannedCount, 2);
    assertIdentical(output.Count, 1);
    assertArrayEquals(orderIds(output), ["2026-01"]);
    assertNonNullable(output.LastEvaluatedKey);
  });

  it("answers with an empty page it can still be resumed from", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When a page is read whose every item the filter drops.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer AND orderId > :after",
        FilterExpression: "#status = :open",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":after": { S: "2026-01" },
          ":open": { S: "OPEN" },
        },
        Limit: 1,
      }),
    );

    // Then the page carries no items and a token to carry on from, since the
    // read reached the limit rather than the end of the collection.
    assertArrayLength(output.Items ?? [], 0);
    assertIdentical(output.Count, 0);
    assertIdentical(output.ScannedCount, 1);
    assertNonNullable(output.LastEvaluatedKey);
  });

  it("reads the whole condition grammar", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When the filter uses functions, comparisons and the words joining them.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        FilterExpression:
          "attribute_exists(#status) AND (total > :least OR " +
          "begins_with(#status, :prefix))",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":least": { N: "3" },
          ":prefix": { S: "OP" },
        },
      }),
    );

    // Then the items it holds for are the ones that come back.
    assertArrayEquals(orderIds(output), ["2026-01", "2026-03", "2026-04"]);
  });

  it("drops an item that does not have what the filter points at", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // And an order with no status at all.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "OrdersTable",
        Item: { customerId: { S: "c-1" }, orderId: { S: "2026-05" } },
      }),
    );

    // When the collection is read with a filter naming that attribute.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        FilterExpression: "#status <> :shipped",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":shipped": { S: "SHIPPED" },
        },
      }),
    );

    // Then the item without it is dropped rather than kept: an attribute that
    // is not there compares to nothing, so the filter does not hold.
    assertArrayEquals(orderIds(output), ["2026-01", "2026-03"]);
  });

  it("counts a placeholder the filter alone uses as used", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When a value only the filter names is supplied.
    const output = await simDynamoDb.query(
      new QueryCommand({
        TableName: "OrdersTable",
        KeyConditionExpression: "customerId = :customer",
        FilterExpression: "total >= :least",
        ExpressionAttributeValues: {
          ":customer": { S: "c-1" },
          ":least": { N: "3" },
        },
      }),
    );

    // Then it is read rather than refused as unused: the key condition and the
    // filter share the placeholders the request defines.
    assertArrayEquals(orderIds(output), ["2026-03", "2026-04"]);
  });

  it("refuses a placeholder neither expression uses", async () => {
    // Given a table holding one customer's open and shipped orders.
    const simAws = new SimAws();
    const simDynamoDb = simAws.dynamoDb();

    await simDynamoDbStockedTableFactory.make(
      { customerCount: 1, orderCount: 4 },
      simAws,
    );

    // When a value no expression names is supplied.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.query(
        new QueryCommand({
          TableName: "OrdersTable",
          KeyConditionExpression: "customerId = :customer",
          FilterExpression: "total >= :least",
          ExpressionAttributeValues: {
            ":customer": { S: "c-1" },
            ":least": { N: "3" },
            ":unused": { S: "nothing" },
          },
        }),
      ),
    );

    // Then it is refused by name.
    assertIdentical(error.name, "ValidationException");
  });
});
