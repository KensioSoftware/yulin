/**
 * Deploying a simulated Lambda Function URL from a CloudFormation template.
 */

import { SimAws } from "@kensio/yulin";
import { serveSimAws } from "@kensio/yulin/serve";

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
          Role: { "Fn::GetAtt": ["GreeterRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs22.x",
          Code: {
            ZipFile:
              "exports.handler = async (event) => " +
              "({ statusCode: 200, body: 'Hello ' + event.rawPath });",
          },
        },
      },
      GreeterUrl: {
        Type: "AWS::Lambda::Url",
        Properties: {
          TargetFunctionArn: { "Fn::GetAtt": ["GreeterFunction", "Arn"] },
          AuthType: "NONE",
        },
      },
    },
    Outputs: {
      GreeterFunctionUrl: {
        Value: { "Fn::GetAtt": ["GreeterUrl", "FunctionUrl"] },
      },
    },
  },
});
await stack.waitForDeployComplete();

const functionUrl = stack.outputs.get("GreeterFunctionUrl")?.value as string;
const srv = await serveSimAws({ simAws });

try {
  const response = await fetch(srv.localUrl(`${functionUrl}hello`));

  console.log(await response.text());
} finally {
  srv.close();
}
