import {
  CreateTableCommand,
  DeleteItemCommand,
  GetItemCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  SimDynamoDbConditionalCheckFailedException,
  SimDynamoDbValidationException,
} from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";

/**
 * A table holding one order at version 2.
 */
async function tableFor(simAws: SimAws): Promise<SimDynamoDb> {
  const simDynamoDb = simAws.dynamoDb();

  await simDynamoDb.createTable(
    new CreateTableCommand({
      TableName: "FooTable",
      KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
  await simAws.backgroundTasksComplete();

  await simDynamoDb.putItem(
    new PutItemCommand({
      TableName: "FooTable",
      Item: {
        orderId: { S: "order-1" },
        status: { S: "shipped" },
        version: { N: "2" },
      },
    }),
  );

  return simDynamoDb;
}

/**
 * The version the stored order is at.
 */
async function storedVersion(
  simDynamoDb: SimDynamoDb,
): Promise<string | undefined> {
  const output = await simDynamoDb.getItem(
    new GetItemCommand({
      TableName: "FooTable",
      Key: { orderId: { S: "order-1" } },
    }),
  );

  return output.Item?.["version"]?.N;
}

describe("DynamoDB conditional writes", () => {
  it("writes an item only where the key is free", async () => {
    // Given a table already holding an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write insists the key is free.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { orderId: { S: "order-1" }, version: { N: "1" } },
          ConditionExpression: "attribute_not_exists(orderId)",
        }),
      ),
    );

    // Then it fails with the name and message real DynamoDB uses, so code
    // catching it by either works here unchanged.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
    assertIdentical(error.name, "ConditionalCheckFailedException");
    assertIdentical(error.message, "The conditional request failed.");

    // And the stored order is exactly as it was.
    assertIdentical(await storedVersion(simDynamoDb), "2");
  });

  it("writes into a key that is free", async () => {
    // Given a table holding one order under a different key.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an insert if absent names a key nothing holds.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-2" }, version: { N: "1" } },
        ConditionExpression: "attribute_not_exists(orderId)",
      }),
    );

    // Then the write goes through.
    const output = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-2" } },
      }),
    );
    assertIdentical(output.Item?.["version"]?.N, "1");
  });

  it("writes only where the version is the one it expected", async () => {
    // Given an order at version 2.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write expects version 1, as a stale reader would.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { orderId: { S: "order-1" }, version: { N: "2" } },
          ConditionExpression: "attribute_exists(orderId) AND version = :was",
          ExpressionAttributeValues: { ":was": { N: "1" } },
        }),
      ),
    );

    // Then it is turned away, and the order is untouched.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
    assertIdentical(await storedVersion(simDynamoDb), "2");

    // And the same write with the version it is actually at goes through.
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-1" }, version: { N: "3" } },
        ConditionExpression: "attribute_exists(orderId) AND version = :was",
        ExpressionAttributeValues: { ":was": { N: "2" } },
      }),
    );
    assertIdentical(await storedVersion(simDynamoDb), "3");
  });

  it("deletes only where the condition holds", async () => {
    // Given an order that has shipped.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a delete insists it has not.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteItem(
        new DeleteItemCommand({
          TableName: "FooTable",
          Key: { orderId: { S: "order-1" } },
          ConditionExpression: "status = :packed",
          ExpressionAttributeValues: { ":packed": { S: "packed" } },
        }),
      ),
    );

    // Then it is turned away, and the order is still there.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
    assertIdentical(await storedVersion(simDynamoDb), "2");

    // And a delete naming the status it actually has removes it.
    const removed = await simDynamoDb.deleteItem(
      new DeleteItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        ConditionExpression: "status = :shipped",
        ExpressionAttributeValues: { ":shipped": { S: "shipped" } },
        ReturnValues: "ALL_OLD",
      }),
    );
    assertIdentical(removed.Attributes?.["status"]?.S, "shipped");
    assertUndefined(await storedVersion(simDynamoDb));
  });

  it("puts the item that turned a write away on the failure when asked", async () => {
    // Given an order at version 2 and a write expecting version 1.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the write asks for the item on failure.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { orderId: { S: "order-1" }, version: { N: "2" } },
          ConditionExpression: "version = :was",
          ExpressionAttributeValues: { ":was": { N: "1" } },
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      ),
    );

    // Then the item it lost to is on the exception, which is how a caller
    // retries without a second read.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
    assertIdentical(error.Item?.["version"]?.N, "2");
  });

  it("leaves the item off the failure when the request did not ask", async () => {
    // Given the same write asking for nothing back, and one asking for NONE.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    for (const asked of [undefined, "NONE"]) {
      // When the condition turns it away.
      // eslint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () =>
        simDynamoDb.putItem({
          input: {
            TableName: "FooTable",
            Item: { orderId: { S: "order-1" }, version: { N: "2" } },
            ConditionExpression: "version = :was",
            ExpressionAttributeValues: { ":was": { N: "1" } },
            ReturnValuesOnConditionCheckFailure: asked,
          },
        }),
      );

      // Then nothing about the stored item is reported back.
      assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
      assertUndefined(error.Item);
    }
  });

  it("reports no item where the condition failed against a free key", async () => {
    // Given a write into a free key that insists something is there.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When the condition turns it away.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { orderId: { S: "order-9" } },
          ConditionExpression: "attribute_exists(orderId)",
          ReturnValuesOnConditionCheckFailure: "ALL_OLD",
        }),
      ),
    );

    // Then there is no item to report, since the key held nothing.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
    assertUndefined(error.Item);
  });

  it("refuses a ReturnValuesOnConditionCheckFailure it does not have", async () => {
    // Given a mode neither PutItem nor DeleteItem takes.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When a write names it, then it is refused naming the command.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.deleteItem({
        input: {
          TableName: "FooTable",
          Key: { orderId: { S: "order-1" } },
          ReturnValuesOnConditionCheckFailure: "ALL_NEW",
        },
      }),
    );

    assertInstanceOf(error, SimDynamoDbValidationException);
    assertIdentical(
      error.message,
      "ReturnValuesOnConditionCheckFailure set to invalid value: ALL_NEW. " +
        "DeleteItem takes NONE or ALL_OLD.",
    );
  });

  it("refuses a bad expression whether or not the key holds anything", async () => {
    // Given a write into a key that holds nothing, with an expression
    // DynamoDB would refuse.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When it is made, then the expression is refused rather than the write
    // quietly going through because there was nothing to check it against.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.putItem(
        new PutItemCommand({
          TableName: "FooTable",
          Item: { orderId: { S: "order-9" } },
          ConditionExpression: "version = :missing",
        }),
      ),
    );

    assertInstanceOf(error, SimDynamoDbValidationException);

    const read = await simDynamoDb.getItem(
      new GetItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-9" } },
      }),
    );
    assertUndefined(read.Item);
  });
});
