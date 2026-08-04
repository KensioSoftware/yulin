/**
 * A table capturing its item changes on a stream.
 */

import {
  CreateTableCommand,
  DescribeTableCommand,
  PutItemCommand,
  UpdateTableCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [{ AttributeName: "orderId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "orderId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: "NEW_AND_OLD_IMAGES",
    },
  }),
);
await simAws.backgroundTasksComplete();

const described = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(described.Table?.StreamSpecification?.StreamViewType); // "NEW_AND_OLD_IMAGES"
console.log(described.Table?.LatestStreamArn?.includes("/stream/")); // true

// Every write from here is captured on the stream.
await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "OrdersTable",
    Item: { orderId: { S: "order-1" }, total: { N: "101" } },
  }),
);

// Switching the stream off keeps what it captured, and keeps naming it.
await dynamoDb.updateTable(
  new UpdateTableCommand({
    TableName: "OrdersTable",
    StreamSpecification: { StreamEnabled: false },
  }),
);
await simAws.backgroundTasksComplete();

const withoutStream = await dynamoDb.describeTable(
  new DescribeTableCommand({ TableName: "OrdersTable" }),
);

console.log(withoutStream.Table?.StreamSpecification?.StreamEnabled); // false
console.log(withoutStream.Table?.LatestStreamArn !== undefined); // true
