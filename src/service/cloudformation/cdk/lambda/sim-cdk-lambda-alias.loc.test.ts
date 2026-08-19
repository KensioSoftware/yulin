import { InvokeCommand } from "@aws-sdk/client-lambda";
import {
  assertIdentical,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then deploys the AWS::Lambda::Version and AWS::Lambda::Alias
 * a `lambda.Alias` app puts in it.
 */
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * The Account and Region the stack is deployed into, which are the
 * simulation's defaults, so the ARNs the app synthesizes and the ARNs the
 * simulator creates are the same.
 */
const accountId = "888888888888";
const regionName = "us-east-1";

describe("Sim CDK Lambda alias local integration", () => {
  it("deploys an alias an invocation reaches the published version through", async () => {
    // Given a CDK stack with a function, its current version and a live alias
    // on that version, which is the three Resources CDK synthesizes for it.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: ${JSON.stringify(accountId)}, region: ${JSON.stringify(regionName)} },
});

const greeterFunction = new lambda.Function(stack, "GreeterFunction", {
  functionName: "cdk-greeter",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(
    "exports.handler = async (event, context) => context.functionVersion;",
  ),
});

const greeterAlias = new lambda.Alias(stack, "GreeterAlias", {
  aliasName: "live",
  version: greeterFunction.currentVersion,
});

new cdk.CfnOutput(stack, "AliasArn", { value: greeterAlias.functionArn });
new cdk.CfnOutput(stack, "AliasVersion", {
  value: greeterAlias.version.version,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the alias the app declared is what its outputs name.
    const aliasArn = stack.outputs.get("AliasArn")?.value;
    assertTypeString(aliasArn);
    assertIdentical(
      aliasArn,
      `arn:aws:lambda:${regionName}:${accountId}:function:cdk-greeter:live`,
    );
    assertIdentical(stack.outputs.get("AliasVersion")?.value, "1");

    // And an invocation through the alias runs the published version rather
    // than $LATEST, which is what the function itself still answers as.
    const throughAlias = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: aliasArn }));
    assertIdentical(throughAlias.ExecutedVersion, "1");
    assertNonNullable(throughAlias.Payload);
    assertIdentical(
      JSON.parse(Buffer.from(throughAlias.Payload).toString()),
      "1",
    );

    const unqualified = await simAws
      .lambda()
      .invoke(new InvokeCommand({ FunctionName: "cdk-greeter" }));
    assertIdentical(unqualified.ExecutedVersion, "$LATEST");

    await simAws.backgroundTasksComplete();
  });
});
