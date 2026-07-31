/**
 * Inserting only if absent, and writing only against the version last read.
 */

import { CreateTableCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "FoobarTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

const order = {
  TableName: "FoobarTable",
  Item: { orderId: { S: "order-1" }, version: { N: "1" } },
  ConditionExpression: "attribute_not_exists(orderId)",
};

// The key is free, so the insert goes through.
await dynamoDb.putItem(new PutItemCommand(order));

// The key is taken now, so the same insert is turned away.
try {
  await dynamoDb.putItem(new PutItemCommand(order));
} catch (error) {
  console.log((error as Error).name); // "ConditionalCheckFailedException"
}

// Optimistic locking: write only if the version is still the one last read.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: { orderId: { S: "order-1" }, version: { N: "2" } },
    ConditionExpression: "version = :was",
    ExpressionAttributeValues: { ":was": { N: "1" } },
  }),
);

// A second writer holding the same stale version now loses the race.
try {
  await dynamoDb.putItem(
    new PutItemCommand({
      TableName: "FoobarTable",
      Item: { orderId: { S: "order-1" }, version: { N: "2" } },
      ConditionExpression: "version = :was",
      ExpressionAttributeValues: { ":was": { N: "1" } },
      ReturnValuesOnConditionCheckFailure: "ALL_OLD",
    }),
  );
} catch (error) {
  // ALL_OLD puts the item it lost to on the exception, so a retry needs no
  // second read.
  console.log((error as { Item?: Record<string, { N?: string }> }).Item);
  // { orderId: { S: "order-1" }, version: { N: "2" } }
}
