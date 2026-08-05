/**
 * Querying a simulated table through the document client, a page at a time.
 */

import { CreateTableCommand, DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  paginateQuery,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

import { SimSdk } from "@kensio/yulin/sdk";

using simSdk = new SimSdk();

const documents = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: "eu-west-2" }),
);
simSdk.intercept(documents);

await documents.send(
  new CreateTableCommand({
    TableName: "OrdersTable",
    KeySchema: [
      { AttributeName: "customerId", KeyType: "HASH" },
      { AttributeName: "orderId", KeyType: "RANGE" },
    ],
    AttributeDefinitions: [
      { AttributeName: "customerId", AttributeType: "S" },
      { AttributeName: "orderId", AttributeType: "S" },
    ],
    BillingMode: "PAY_PER_REQUEST",
  }),
);
await simSdk.simAws.backgroundTasksComplete();

for (const orderId of ["order-1", "order-2"]) {
  await documents.send(
    new PutCommand({
      TableName: "OrdersTable",
      Item: { customerId: "cust-1", orderId, total: 42 },
    }),
  );
}

const query = {
  TableName: "OrdersTable",
  KeyConditionExpression: "customerId = :customer",
  ExpressionAttributeValues: { ":customer": "cust-1" },
  Limit: 1,
};

const first = await documents.send(new QueryCommand(query));

console.log(first.Items?.[0]?.["total"]); // 42

// The key comes back as plain JavaScript, and goes back in as it is.
const second = await documents.send(
  new QueryCommand({ ...query, ExclusiveStartKey: first.LastEvaluatedKey }),
);

console.log(second.Items?.[0]?.["orderId"]); // order-2

// The paginators send the same Commands, so they need nothing extra. Each one
// writes the next start key into the input it was given, so it gets a copy.
const pages = paginateQuery({ client: documents, pageSize: 1 }, { ...query });

for await (const page of pages) {
  console.log(page.Items?.length); // 1
}
