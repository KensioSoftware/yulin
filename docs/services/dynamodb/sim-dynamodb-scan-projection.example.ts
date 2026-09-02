/**
 * Scanning a table without reading the attributes the caller has no use for.
 */

import {
  CreateTableCommand,
  PutItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const dynamoDb = simAws.dynamoDb();

await dynamoDb.createTable(
  new CreateTableCommand({
    TableName: "ReadersTable",
    KeySchema: [{ AttributeName: "readerId", KeyType: "HASH" }],
    AttributeDefinitions: [{ AttributeName: "readerId", AttributeType: "S" }],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simAws.backgroundTasksComplete();

await dynamoDb.putItem(
  new PutItemCommand({
    TableName: "ReadersTable",
    Item: {
      readerId: { S: "reader-1" },
      email: { S: "reader@example.com" },
      status: { S: "active" },
      lastReadAt: { S: "2026-01-31" },
    },
  }),
);

const output = await dynamoDb.scan(
  new ScanCommand({
    TableName: "ReadersTable",
    // `status` is a DynamoDB reserved word, so it is named by a placeholder.
    ProjectionExpression: "#status, lastReadAt",
    ExpressionAttributeNames: { "#status": "status" },
  }),
);

// The key the scan walked by is left out along with the email address.
console.log(Object.keys(output.Items?.[0] ?? {}));
// [ "status", "lastReadAt" ]

console.log(output.Items?.[0]?.["lastReadAt"]?.S);
// 2026-01-31
