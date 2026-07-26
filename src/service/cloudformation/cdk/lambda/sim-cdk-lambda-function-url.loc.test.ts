import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertTypeString,
} from "@kensio/smartass";
import path from "node:path";
import { describe, it } from "vitest";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file, then serves the deployed Function URL over real localhost
 * HTTP.
 */
import { serveSimAws } from "../../../../serve/index.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TemporaryDirectory } from "../../../../util/filesystem/temporary-directory.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Inline function code, as CDK packages Code.fromInline source. The handler
 * returns a structured Function URL response, reading the query string from
 * the payload format 2.0 event.
 */
const greeterHandlerSource = `
exports.handler = async (event) => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: "Hello " + (event.queryStringParameters?.name || "world"),
});
`;

describe("Sim CDK Lambda Function URL deployment local integration", () => {
  it("serves a CDK-deployed Function URL over localhost", async () => {
    // Given a CDK stack with a Lambda function that has a public Function URL.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const greeterFunction = new lambda.Function(stack, "GreeterFunction", {
  functionName: "cdk-greeter",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(${JSON.stringify(greeterHandlerSource)}),
});

const greeterUrl = greeterFunction.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
});

new cdk.CfnOutput(stack, "GreeterFunctionUrl", {
  value: greeterUrl.url,
});

app.synth();
      `,
    );

    // And we synth the CDK template.
    const cdkOutDirectory = await cdkProject.synth();

    // When we deploy the template into sim CloudFormation and serve it.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the CDK Function URL output is the deployed endpoint.
    const functionUrl = stack.outputs.get("GreeterFunctionUrl")?.value;
    assertTypeString(functionUrl);
    assertIdentical(
      functionUrl,
      simAws.lambda().getSimFunctionUrl("cdk-greeter")?.url,
    );

    // And fetching that endpoint on localhost runs the deployed function.
    const srv = await serveSimAws({ simAws });

    try {
      const response = await fetch(
        srv.localUrl(`${functionUrl}greet?name=CDK`),
      );

      assertIdentical(response.status, 200);
      assertIdentical(response.headers.get("content-type"), "text/plain");
      assertIdentical(await response.text(), "Hello CDK");
    } finally {
      srv.close();
    }

    await simAws.backgroundTasksComplete();
  });

  it("skips the AWS::Lambda::Permission CDK adds for a public URL", async () => {
    // Given a CDK stack with a public Function URL, which CDK pairs with an
    // AWS::Lambda::Permission granting lambda:InvokeFunctionUrl to everyone.
    const simAws = new SimAws();
    const projectDirectory = new TemporaryDirectory();
    const cdkProject = new TestCdkProject({ projectDirectory });
    await cdkProject.writeCdkAppFile(
      `
import * as cdk from "aws-cdk-lib/core";
import * as lambda from "aws-cdk-lib/aws-lambda";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const greeterFunction = new lambda.Function(stack, "GreeterFunction", {
  functionName: "cdk-greeter",
  runtime: lambda.Runtime.NODEJS_20_X,
  handler: "index.handler",
  code: lambda.Code.fromInline("exports.handler = async () => 'ok';"),
});

greeterFunction.addFunctionUrl({
  authType: lambda.FunctionUrlAuthType.NONE,
});

app.synth();
      `,
    );
    const cdkOutDirectory = await cdkProject.synth();

    // When the template is deployed.
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );
    await simAws.backgroundTasksComplete();

    // Then the unsupported permission Resource is skipped with a diagnostic
    // rather than failing the deployment, and the Function URL still works.
    const permissionResource = stack.resources
      .values()
      .find((resource) => resource.type === "AWS::Lambda::Permission");
    assertNonNullable(permissionResource);
    assertTrue(permissionResource.skipped);
    assertStringIncludes(
      permissionResource.skippedReason ?? "",
      "Unsupported sim Lambda CloudFormation Resource Permission",
    );
    assertNonNullable(simAws.lambda().getSimFunctionUrl("cdk-greeter"));

    await simAws.backgroundTasksComplete();
  });
});
