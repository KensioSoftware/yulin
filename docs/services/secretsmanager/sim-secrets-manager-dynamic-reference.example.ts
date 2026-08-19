/**
 * A CloudFormation template reading a secret into a Lambda function's
 * environment.
 */

import { InvokeCommand } from "@aws-sdk/client-lambda";
import { CreateSecretCommand } from "@aws-sdk/client-secrets-manager";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();

await simAws.secretsManager().createSecret(
  new CreateSecretCommand({
    Name: "db-credentials",
    SecretString: JSON.stringify({ username: "app", password: "hunter2" }),
  }),
);

const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "api-stack",
  template: {
    Resources: {
      ApiRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "ApiRole",
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
      ApiFunction: {
        Type: "AWS::Lambda::Function",
        Properties: {
          FunctionName: "api",
          Role: { "Fn::GetAtt": ["ApiRole", "Arn"] },
          Handler: "index.handler",
          Runtime: "nodejs20.x",
          Environment: {
            Variables: {
              DB_USERNAME:
                "{{resolve:secretsmanager:db-credentials:SecretString:username}}",
              DB_PASSWORD:
                "{{resolve:secretsmanager:db-credentials:SecretString:password}}",
            },
          },
          Code: {
            ZipFile: "exports.handler = async () => process.env.DB_USERNAME;",
          },
        },
      },
    },
  },
});

await stack.waitForDeployComplete();

// The function was created holding the values the references resolved to.
const output = await simAws
  .lambda()
  .invoke(new InvokeCommand({ FunctionName: "api" }));

const username = JSON.parse(
  Buffer.from(output.Payload ?? []).toString(),
) as string;

console.log(username); // "app"

await simAws.backgroundTasksComplete();
