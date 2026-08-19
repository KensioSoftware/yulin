/**
 * Deploying a Lambda version and an alias on it from a CloudFormation
 * template, and invoking the function through the alias.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "greeter-stack",
  template: {
    Resources: {
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: "arn:aws:iam::111111111111:role/GreeterRole",
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: {
            ZipFile:
              "exports.handler = async (event, context) => " +
              "context.functionVersion;",
          },
        },
      },
      GreeterVersion: {
        Type: "AWS::Lambda::Version",
        Properties: {
          FunctionName: { Ref: "GreeterFunction" },
        },
      },
      GreeterAlias: {
        Type: "AWS::Lambda::Alias",
        Properties: {
          FunctionName: { Ref: "GreeterFunction" },
          Name: "live",
          FunctionVersion: { "Fn::GetAtt": ["GreeterVersion", "Version"] },
        },
      },
    },
    Outputs: {
      GreeterAliasArn: { Value: { Ref: "GreeterAlias" } },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.output("GreeterAliasArn"));

const invoked = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "greeter", Qualifier: "live" }));

console.log(invoked.ExecutedVersion);

await simAws.backgroundTasksComplete();
