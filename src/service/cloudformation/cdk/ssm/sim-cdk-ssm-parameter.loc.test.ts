import { InvokeCommand } from "@aws-sdk/client-lambda";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  assertIdentical,
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
const accountIdOneOnes = "111111111111";

/**
 * A handler reading the parameter whose name CDK put in its environment.
 */
const readParameterHandlerSource = `
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");
const client = new SSMClient({});
exports.handler = async () => {
  const output = await client.send(
    new GetParameterCommand({ Name: process.env.DB_HOST_PARAMETER }),
  );
  return { host: output.Parameter.Value };
};
`;

describe("Sim CDK SSM Parameter deployment local integration", () => {
  it("deploys a CDK string parameter a granted Lambda reads", async () => {
    // Given a CDK stack with a string parameter and a Lambda granted read
    // access to it, handed the parameter name through its environment.
    const cdkProject = new TestCdkProject();
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as ssm from "aws-cdk-lib/aws-ssm";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const dbHost = new ssm.StringParameter(stack, "DbHost", {
  parameterName: "/myapp/prod/db-host",
  stringValue: "db.internal",
  description: "Where the application database lives",
});

const readerFunction = new lambda.Function(stack, "ReaderFunction", {
  functionName: "cdk-config-reader",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(readParameterHandlerSource)}),
  environment: {
    DB_HOST_PARAMETER: dbHost.parameterName,
  },
});

dbHost.grantRead(readerFunction);

new cdk.CfnOutput(stack, "DbHostName", {
  value: dbHost.parameterName,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the synthesized template into the account and region the
    // CDK app declares, with no hand-editing of the AWS::SSM::Parameter
    // Resource CDK emits.
    const simAws = new SimAws();
    const scoped = simAws.account(accountIdOneOnes).region("eu-west-2");
    const stack = await scoped
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the parameter name CDK output carries is the deployed parameter.
    const parameterName = stack.outputs.get("DbHostName")?.value;
    assertTypeString(parameterName);

    const read = await scoped
      .ssm()
      .getParameter(new GetParameterCommand({ Name: parameterName }));
    assertIdentical(read.Parameter?.Value, "db.internal");

    // And the deployed function reads that value as its granted execution
    // role, against the parameter ARN the CDK grant produced.
    const invoked = await scoped
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "cdk-config-reader" }));

    assertUndefined(invoked.FunctionError);
    const payload = Buffer.from(invoked.Payload ?? emptyBytes).toString("utf8");
    assertIdentical(payload, JSON.stringify({ host: "db.internal" }));

    await simAws.backgroundTasksComplete();
  });
});
