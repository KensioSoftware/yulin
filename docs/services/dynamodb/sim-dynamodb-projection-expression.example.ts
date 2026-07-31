/**
 * Reading part of an item with a projection expression.
 */

import {
  CreateTableCommand,
  GetItemCommand,
  PutItemCommand,
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
      status: { S: "shipped" },
      address: { M: { city: { S: "Leeds" }, postcode: { S: "LS1 1AA" } } },
      lines: { L: [{ S: "widget" }, { S: "gasket" }] },
    },
  }),
);

const output = await dynamoDb.getItem(
  new GetItemCommand({
    TableName: "FoobarTable",
    Key: { orderId: { S: "order-1" } },
    ProjectionExpression: "#s, address.city, lines[0]",
    ExpressionAttributeNames: { "#s": "status" },
  }),
);

console.log(Object.keys(output.Item ?? {}));
// [ "status", "address", "lines" ]

// The nested shape is kept: the address holds only the projected attribute.
console.log(output.Item?.["address"]?.M);
// { city: { S: "Leeds" } }

// A projected list element comes back as a one element list.
console.log(output.Item?.["lines"]?.L?.length);
// 1
