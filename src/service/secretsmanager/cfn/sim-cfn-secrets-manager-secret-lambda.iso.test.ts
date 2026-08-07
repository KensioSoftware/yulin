import { InvokeCommand } from "@aws-sdk/client-lambda";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertStringIncludes,
  assertStringLength,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../cloudformation/template/sim-cfn-template.js";

const emptyBytes = new Uint8Array();

const assumeRolePolicyDocument = {
  Version: "2012-10-17",
  Statement: [
    {
      Effect: "Allow",
      Principal: { Service: "lambda.amazonaws.com" },
      Action: "sts:AssumeRole",
    },
  ],
};

/**
 * A handler that reads the secret whose ARN its environment carries, as an
 * application fetching its database password on a cold start does.
 */
const readSecretHandlerSource = `
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const client = new SecretsManagerClient({});
exports.handler = async () => {
  const output = await client.send(
    new GetSecretValueCommand({ SecretId: process.env.SECRET_ARN }),
  );
  return JSON.parse(output.SecretString);
};
`;

/**
 * A secret ARN without the random suffix, written as CloudFormation would
 * substitute it.
 */
const bareSecretArnSubstitution =
  // oxlint-disable-next-line no-template-curly-in-string -- Fn::Sub syntax, not a JavaScript template.
  "arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:db-credentials";

/**
 * A stack holding a generated secret and a Lambda handed its ARN, with the
 * function's execution Role allowed to read exactly that secret.
 */
const template: CfnTemplateBodyRecord = {
  Resources: {
    DbSecret: {
      Type: "AWS::SecretsManager::Secret",
      Properties: {
        Name: "db-credentials",
        GenerateSecretString: {
          SecretStringTemplate: JSON.stringify({ username: "app" }),
          GenerateStringKey: "password",
          PasswordLength: 20,
        },
      },
    },
    ReaderRole: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "SecretReaderRole",
        AssumeRolePolicyDocument: assumeRolePolicyDocument,
        Policies: [
          {
            PolicyName: "ReadDbSecret",
            PolicyDocument: {
              Version: "2012-10-17",
              Statement: [
                {
                  Effect: "Allow",
                  Action: "secretsmanager:GetSecretValue",
                  Resource: { Ref: "DbSecret" },
                },
              ],
            },
          },
        ],
      },
    },
    ReaderFunction: {
      Type: "AWS::Lambda::Function",
      Properties: {
        FunctionName: "secret-reader",
        Role: { "Fn::GetAtt": ["ReaderRole", "Arn"] },
        Handler: "index.handler",
        Runtime: "nodejs20.x",
        Code: { ZipFile: readSecretHandlerSource },
        Environment: {
          Variables: {
            SECRET_ARN: { Ref: "DbSecret" },
          },
        },
      },
    },
  },
};

describe("Secrets Manager CloudFormation Secret with Lambda", () => {
  it("hands a Lambda the secret ARN to read the generated password", async () => {
    // Given a stack with a generated secret, a Lambda holding its ARN in the
    // environment, and an execution Role allowed to read it.
    const simAws = new SimAws();

    // When the stack is deployed and the function is invoked.
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "db-stack", template });
    await stack.waitForDeployComplete();

    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "secret-reader" }));

    // Then the handler read the generated value out of simulated Secrets
    // Manager as its execution Role.
    assertUndefined(invoked.FunctionError);

    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    const value = JSON.parse(payload) as {
      username?: string;
      password?: string;
    };

    assertIdentical(value.username, "app");
    assertTypeString(value.password);
    assertStringLength(value.password, 20);

    // And what the handler read is the value the deployment generated, which
    // nothing in the test had to predict.
    const read = await simAws
      .secretsManager()
      .getSecretValue(
        new GetSecretValueCommand({ SecretId: "db-credentials" }),
      );
    assertIdentical(read.SecretString, JSON.stringify(value));
  });

  it("denies a Lambda whose Role names the secret without its ARN suffix", async () => {
    // Given the same stack, except that the Role's policy names the secret by
    // a bare ARN, as a hand-written policy easily does.
    const simAws = new SimAws();
    const bareArnTemplate: CfnTemplateBodyRecord = {
      Resources: {
        ...template.Resources,
        ReaderRole: {
          Type: "AWS::IAM::Role",
          Properties: {
            RoleName: "SecretReaderRole",
            AssumeRolePolicyDocument: assumeRolePolicyDocument,
            Policies: [
              {
                PolicyName: "ReadDbSecret",
                PolicyDocument: {
                  Version: "2012-10-17",
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "secretsmanager:GetSecretValue",
                      Resource: { "Fn::Sub": bareSecretArnSubstitution },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    };

    // When the stack is deployed and the function is invoked.
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "db-stack", template: bareArnTemplate });
    await stack.waitForDeployComplete();

    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "secret-reader" }));

    // Then the read is denied, exactly as it would be on real AWS, where the
    // secret's ARN carries six random characters the policy has to allow for.
    assertIdentical(invoked.FunctionError, "Unhandled");

    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    assertStringIncludes(payload, "not authorized");
  });
});
