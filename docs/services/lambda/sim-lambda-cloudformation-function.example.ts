/**
 * Creating an invokable Lambda function through simulated CloudFormation.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "greeter-stack",
  template: {
    Resources: {
      GreeterRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "GreeterRole",
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
        },
      },
      GreeterFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "greeter",
          Role: {
            "Fn::GetAtt": ["GreeterRole", "Arn"],
          },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Code: {
            ZipFile:
              "exports.handler = async (event) => 'Hello ' + event.name;",
          },
        },
      },
    },
    Outputs: {
      FunctionName: {
        Value: {
          Ref: "GreeterFunction",
        },
      },
      FunctionArn: {
        Value: {
          "Fn::GetAtt": ["GreeterFunction", "Arn"],
        },
      },
    },
  },
});
await stack.waitForDeployComplete();

console.log(stack.output("FunctionName"));
console.log(stack.output("FunctionArn"));

const output = await simAws.lambda().invoke(
  new InvokeCommand({
    FunctionName: "greeter",
    Payload: JSON.stringify({ name: "Yulin" }),
  }),
);

if (output.Payload === undefined) throw new Error("No invoke Payload");
console.log(Buffer.from(output.Payload).toString());

await simAws.backgroundTasksComplete();
