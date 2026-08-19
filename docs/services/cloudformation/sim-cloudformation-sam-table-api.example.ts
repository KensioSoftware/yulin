/**
 * Deploying a SAM AWS::Serverless::SimpleTable and AWS::Serverless::HttpApi.
 */

import { DescribeTableCommand } from "@aws-sdk/client-dynamodb";
import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Globals: {
      HttpApi: {
        StageVariables: { TABLE_NAME: "orders" },
      },
    },
    Resources: {
      OrdersTable: {
        Type: "AWS::Serverless::SimpleTable",
        Properties: {
          TableName: "orders",
          PrimaryKey: { Name: "orderId", Type: "String" },
        },
      },
      Orders: {
        Type: "AWS::Serverless::HttpApi",
        Properties: { Name: "orders" },
      },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.getResource("Orders")?.type);
console.log(stack.getResource("OrdersApiGatewayDefaultStage")?.type);

const described = await simAws
  .dynamoDb()
  .describeTable(new DescribeTableCommand({ TableName: "orders" }));

console.log(described.Table?.KeySchema);
