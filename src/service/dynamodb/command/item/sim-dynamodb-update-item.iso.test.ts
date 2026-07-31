import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimDynamoDbConditionalCheckFailedException } from "../../error/dynamodb.error.js";
import type { SimDynamoDb } from "../../sim-dynamodb.js";
import type { SimDynamoDbAttributeValue } from "./item.types.js";

/**
 * A table with one string partition key, holding nothing yet.
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

  return simDynamoDb;
}

/**
 * The item stored under the one key these tests use, which every one of them
 * leaves an item under.
 */
async function storedOrder(
  simDynamoDb: SimDynamoDb,
): Promise<Readonly<Record<string, SimDynamoDbAttributeValue>>> {
  const output = await simDynamoDb.getItem(
    new GetItemCommand({
      TableName: "FooTable",
      Key: { orderId: { S: "order-1" } },
    }),
  );

  assertNonNullable(output.Item);

  return output.Item;
}

describe("DynamoDB UpdateItemCommand", () => {
  it("changes the attributes a SET names and leaves the rest alone", async () => {
    // Given an order holding a status and a version.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          orderId: { S: "order-1" },
          status: { S: "packing" },
          version: { N: "1" },
        },
      }),
    );

    // When one attribute is set.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET #s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":status": { S: "shipped" } },
      }),
    );

    // Then that attribute changed, and the others are as they were.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["status"]?.S, "shipped");
    assertIdentical(stored["version"]?.N, "1");
    assertIdentical(stored["orderId"]?.S, "order-1");
  });

  it("reads every action against the item as it stood before the update", async () => {
    // Given an order holding three numbers.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: {
          orderId: { S: "order-1" },
          a: { N: "1" },
          b: { N: "2" },
          c: { N: "3" },
        },
      }),
    );

    // When one expression removes an attribute the assignments read.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "REMOVE a SET b = a, c = b",
      }),
    );

    // Then both assignments took the values from before the update, and the
    // REMOVE written first did not take `a` away from the assignment reading it.
    const stored = await storedOrder(simDynamoDb);
    assertUndefined(stored["a"]);
    assertIdentical(stored["b"]?.N, "1");
    assertIdentical(stored["c"]?.N, "2");
  });

  it("removes an attribute that is not there without changing the item", async () => {
    // Given an order with no note on it.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-1" }, status: { S: "packing" } },
      }),
    );

    // When the note is removed anyway.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "REMOVE note",
      }),
    );

    // Then the update succeeded and the item is exactly as it was.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["status"]?.S, "packing");
    assertUndefined(stored["note"]);
  });

  it("keeps a value if_not_exists finds, and assigns one it does not", async () => {
    // Given an order that already has a status and no note.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-1" }, status: { S: "packing" } },
      }),
    );

    // When both are given a default.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression:
          "SET #s = if_not_exists(#s, :new), note = if_not_exists(note, :none)",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":new": { S: "new" },
          ":none": { S: "no note" },
        },
      }),
    );

    // Then the stored status won, and the note took the default.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["status"]?.S, "packing");
    assertIdentical(stored["note"]?.S, "no note");
  });

  it("creates the item from the Key and the SET actions when the key holds nothing", async () => {
    // Given a table holding nothing.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update names a key nothing is stored under.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET #s = :status",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: { ":status": { S: "packing" } },
      }),
    );

    // Then the item was created, holding the Key and what the update set.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["orderId"]?.S, "order-1");
    assertIdentical(stored["status"]?.S, "packing");
  });

  it("changes nothing when the condition guarding it does not hold", async () => {
    // Given an order at version 2.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-1" }, version: { N: "2" } },
      }),
    );

    // When an update insists on the version it last read.
    const error = await assertThrowsErrorAsync(async () =>
      simDynamoDb.updateItem(
        new UpdateItemCommand({
          TableName: "FooTable",
          Key: { orderId: { S: "order-1" } },
          UpdateExpression: "SET #s = :status",
          ConditionExpression: "version = :was",
          ExpressionAttributeNames: { "#s": "status" },
          ExpressionAttributeValues: {
            ":status": { S: "shipped" },
            ":was": { N: "1" },
          },
        }),
      ),
    );

    // Then it failed the way a conditional write does, and the item is as it
    // was: the placeholders of both expressions were read as one set.
    assertInstanceOf(error, SimDynamoDbConditionalCheckFailedException);
    const stored = await storedOrder(simDynamoDb);
    assertUndefined(stored["status"]);
    assertIdentical(stored["version"]?.N, "2");
  });

  it("writes when the condition guarding it holds", async () => {
    // Given an order at version 1.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-1" }, version: { N: "1" } },
      }),
    );

    // When an update names the version it last read.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
        UpdateExpression: "SET #s = :status",
        ConditionExpression: "version = :was",
        ExpressionAttributeNames: { "#s": "status" },
        ExpressionAttributeValues: {
          ":status": { S: "shipped" },
          ":was": { N: "1" },
        },
      }),
    );

    // Then the change went through.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["status"]?.S, "shipped");
  });

  it("leaves the item alone when the request carries no update expression", async () => {
    // Given an order.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);
    await simDynamoDb.putItem(
      new PutItemCommand({
        TableName: "FooTable",
        Item: { orderId: { S: "order-1" }, status: { S: "packing" } },
      }),
    );

    // When an update says nothing to change.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then the item is exactly as it was.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["status"]?.S, "packing");
  });

  it("creates an item holding only the Key when the request says nothing to change", async () => {
    // Given a table holding nothing.
    const simAws = new SimAws();
    const simDynamoDb = await tableFor(simAws);

    // When an update names a key nothing is stored under and changes nothing.
    await simDynamoDb.updateItem(
      new UpdateItemCommand({
        TableName: "FooTable",
        Key: { orderId: { S: "order-1" } },
      }),
    );

    // Then UpdateItem still upserted, so the item is there with its key.
    const stored = await storedOrder(simDynamoDb);
    assertIdentical(stored["orderId"]?.S, "order-1");
  });
});
