/**
 * Deploying a SAM AWS::Serverless::Api, with the Globals.Api defaults.
 */

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "orders-stack",
  template: {
    Transform: "AWS::Serverless-2016-10-31",
    Globals: {
      Api: { Variables: { TABLE_NAME: "orders" } },
    },
    Resources: {
      Orders: {
        Type: "AWS::Serverless::Api",
        Properties: { Name: "orders-api", StageName: "prod" },
      },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.getResource("Orders")?.type);
// "AWS::ApiGateway::RestApi"

console.log(stack.getResource("OrdersDeployment")?.type);
// "AWS::ApiGateway::Deployment"

console.log(stack.getResource("OrdersprodStage")?.type);
// "AWS::ApiGateway::Stage"
