/**
 * Deploying a table with secondary indexes from a CloudFormation template.
 */

import { PutItemCommand, QueryCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          TableName: "orders",
          KeySchema: [
            { AttributeName: "customerId", KeyType: "HASH" },
            { AttributeName: "orderId", KeyType: "RANGE" },
          ],
          AttributeDefinitions: [
            { AttributeName: "customerId", AttributeType: "S" },
            { AttributeName: "orderId", AttributeType: "S" },
            { AttributeName: "status", AttributeType: "S" },
            { AttributeName: "total", AttributeType: "N" },
          ],
          BillingMode: "PAY_PER_REQUEST",
          GlobalSecondaryIndexes: [
            {
              IndexName: "byStatus",
              KeySchema: [{ AttributeName: "status", KeyType: "HASH" }],
              Projection: { ProjectionType: "ALL" },
            },
          ],
          LocalSecondaryIndexes: [
            {
              IndexName: "byTotal",
              KeySchema: [
                { AttributeName: "customerId", KeyType: "HASH" },
                { AttributeName: "total", KeyType: "RANGE" },
              ],
              Projection: { ProjectionType: "ALL" },
            },
          ],
        },
      },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

await simAws.dynamoDb().putItem(
  new PutItemCommand({
    TableName: "orders",
    Item: {
      customerId: { S: "customer-1" },
      orderId: { S: "order-1" },
      status: { S: "OPEN" },
      total: { N: "42" },
    },
  }),
);

// The global index is keyed by a partition key the table does not have.
const open = await simAws.dynamoDb().query(
  new QueryCommand({
    TableName: "orders",
    IndexName: "byStatus",
    KeyConditionExpression: "#status = :status",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":status": { S: "OPEN" } },
  }),
);

console.log(open.Items?.[0]?.["orderId"]?.S); // "order-1"

// The local index sorts one customer's orders by total.
const byTotal = await simAws.dynamoDb().query(
  new QueryCommand({
    TableName: "orders",
    IndexName: "byTotal",
    KeyConditionExpression: "customerId = :customerId",
    ExpressionAttributeValues: { ":customerId": { S: "customer-1" } },
  }),
);

console.log(byTotal.Count); // 1
