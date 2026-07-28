import { InvokeCommand } from "@aws-sdk/client-lambda";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  assertIdentical,
  assertNonNullable,
  assertStringLength,
  assertTypeString,
  assertUndefined,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file to pass to sim CloudFormation, so the template under test is
 * one CDK actually produced rather than one written by hand.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

const emptyBytes = new Uint8Array();

/**
 * A handler reading the secret whose ARN CDK put in its environment.
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

describe("Sim CDK Secrets Manager deployment local integration", () => {
  it("deploys a CDK secret a granted Lambda reads", async () => {
    // Given a CDK stack with a generated secret and a Lambda granted read
    // access to it, handed the secret ARN through its environment.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const dbSecret = new secretsmanager.Secret(stack, "DbSecret", {
  generateSecretString: {
    secretStringTemplate: JSON.stringify({ username: "app" }),
    generateStringKey: "password",
    passwordLength: 24,
    excludePunctuation: true,
  },
});

const readerFunction = new lambda.Function(stack, "ReaderFunction", {
  functionName: "cdk-secret-reader",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(readSecretHandlerSource)}),
  environment: {
    SECRET_ARN: dbSecret.secretArn,
  },
});

dbSecret.grantRead(readerFunction);

new cdk.CfnOutput(stack, "DbSecretArn", {
  value: dbSecret.secretArn,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into sim CloudFormation, with no
    // hand-editing of the GenerateSecretString CDK emits.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the secret ARN CDK output carries the random suffix real Secrets
    // Manager appends.
    const secretArn = stack.outputs.get("DbSecretArn")?.value;
    assertTypeString(secretArn);

    const read = await simAws
      .secretsManager()
      .getSecretValue(new GetSecretValueCommand({ SecretId: secretArn }));
    assertTypeString(read.SecretString);

    // And the deployed function reads the generated password as its granted
    // execution role.
    const invoked = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "cdk-secret-reader" }));

    assertUndefined(invoked.FunctionError);
    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    const value = JSON.parse(payload) as {
      username?: string;
      password?: string;
    };

    assertIdentical(value.username, "app");
    assertNonNullable(value.password);
    assertStringLength(value.password, 24);
    assertIdentical(read.SecretString, JSON.stringify(value));

    await simAws.backgroundTasksComplete();
  });
});
