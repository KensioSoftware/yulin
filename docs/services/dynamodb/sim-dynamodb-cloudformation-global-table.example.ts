/**
 * Deploying a global table with one replica from a CloudFormation template.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::GlobalTable",
        Properties: {
          TableName: "orders",
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
          // The replica carries what an ordinary table says about itself.
          Replicas: [
            {
              Region: "us-east-1",
              Tags: [{ Key: "Environment", Value: "test" }],
            },
          ],
        },
      },
    },
    Outputs: {
      OrdersTableName: { Value: { Ref: "OrdersTable" } },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

const tableName = stack.output("OrdersTableName");

console.log(tableName);
// "orders"

await simAws
  .dynamoDb()
  .putItem(
    new PutItemCommand({ TableName: tableName, Item: { id: { S: "1" } } }),
  );
