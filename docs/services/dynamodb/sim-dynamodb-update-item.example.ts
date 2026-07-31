/**
 * Changing part of an item, against the item as it stood before the update.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";

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

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "FoobarTable",
    Item: {
      orderId: { S: "order-1" },
      a: { N: "1" },
      b: { N: "2" },
      c: { N: "3" },
      draft: { BOOL: true },
    },
  }),
);

// Both assignments read the values from before the update, so removing `a`
// first does not take it away from the assignment reading it.
const updated = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-1" } },
    UpdateExpression: "REMOVE a, draft SET b = a, c = b",
    ReturnValues: "ALL_NEW",
  }),
);

console.log(updated.Attributes?.["b"]?.N); // "1"
console.log(updated.Attributes?.["c"]?.N); // "2"
console.log(updated.Attributes?.["a"]); // undefined

// if_not_exists keeps a value that is already there, and assigns one when it
// is not.
const defaulted = await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-1" } },
    UpdateExpression: "SET #s = if_not_exists(#s, :packing)",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":packing": { S: "packing" } },
    ReturnValues: "ALL_NEW",
  }),
);

console.log(defaulted.Attributes?.["status"]?.S); // "packing"

// UpdateItem upserts, so a key holding nothing gets an item built from the Key
// and the SET actions.
await dynamoDb.updateItem(
  new UpdateItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-2" } },
    UpdateExpression: "SET #s = :new",
    ExpressionAttributeNames: { "#s": "status" },
    ExpressionAttributeValues: { ":new": { S: "new" } },
  }),
);
