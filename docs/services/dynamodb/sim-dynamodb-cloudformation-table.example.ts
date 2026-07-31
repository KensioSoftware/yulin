/**
 * Deploying a table from a CloudFormation template and writing to it.
 */

import { PutItemCommand } from "@aws-sdk/client-dynamodb";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Resources: {
      OrdersTable: {
        Type: "AWS::DynamoDB::Table",
        Properties: {
          KeySchema: [{ AttributeName: "id", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "id", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        },
      },
    },
    Outputs: {
      OrdersTableName: { Value: { Ref: "OrdersTable" } },
      OrdersTableArn: { Value: { "Fn::GetAtt": ["OrdersTable", "Arn"] } },
    },
  },
});

await stack.waitForDeployComplete();
await simAws.backgroundTasksComplete();

// Ref resolves to the table name, so it works as a PutItem TableName.
const tableName = stack.outputs.get("OrdersTableName")?.value as string;

console.log(tableName);
// "orders-stack-OrdersTable"

await simAws
  .dynamoDb()
  .putItem(
    new PutItemCommand({ TableName: tableName, Item: { id: { S: "1" } } }),
  );

console.log(stack.outputs.get("OrdersTableArn")?.value);
// "arn:aws:dynamodb:us-east-1:888888888888:table/orders-stack-OrdersTable"
