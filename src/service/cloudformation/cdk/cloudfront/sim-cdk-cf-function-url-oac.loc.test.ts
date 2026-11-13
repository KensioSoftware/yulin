import path from "node:path";
import {
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Inline function code, as CDK packages Code.fromInline source.
 */
const greeterHandlerSource = `
exports.handler = async () => ({
  statusCode: 200,
  headers: { "content-type": "text/plain" },
  body: "Hello from behind CloudFront",
});
`;

/**
 * The `lambda:InvokeFunction` grant an app on an older CDK adds by hand.
 *
 * `FunctionUrlOrigin.withOriginAccessControl()` once wrote only the
 * `lambda:InvokeFunctionUrl` grant. It now writes this one too, restricted to
 * calls through the URL with `InvokedViaFunctionUrl`. An app written for the
 * older CDK still carries its own copy, unrestricted.
 */
const invokeFunctionGrantSource = `
greeterFunction.addPermission("InvokeFunctionFromCloudFront", {
  principal: new iam.ServicePrincipal("cloudfront.amazonaws.com"),
  action: "lambda:InvokeFunction",
  sourceArn: cdk.Fn.join("", [
    "arn:",
    cdk.Aws.PARTITION,
    ":cloudfront::",
    cdk.Aws.ACCOUNT_ID,
    ":distribution/",
    distribution.distributionId,
  ]),
});
`;

/**
 * A CDK app putting a private Function URL behind a Distribution, with
 * whatever the test adds after the Distribution exists.
 */
function cdkAppSource(afterDistribution: string): string {
  return `
import * as cdk from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

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
  authType: lambda.FunctionUrlAuthType.AWS_IAM,
});

const distribution = new cloudfront.Distribution(stack, "SiteDistribution", {
  defaultBehavior: {
    origin: origins.FunctionUrlOrigin.withOriginAccessControl(greeterUrl),
  },
});

${afterDistribution}

new cdk.CfnOutput(stack, "DistributionId", {
  value: distribution.distributionId,
});

app.synth();
`;
}

/**
 * Synth the app, deploy it through sim CloudFormation and fetch a path through
 * the Distribution it created.
 */
async function fetchThroughCdkDistribution(
  afterDistribution: string,
): Promise<Response> {
  const cdkProject = new TestCdkProject();
  await cdkProject.writeCdkAppFile(cdkAppSource(afterDistribution));
  const cdkOutDirectory = await cdkProject.synth();

  const simAws = new SimAws();
  const stack = await simAws
    .cloudFormation()
    .deployTemplateFile(path.join(cdkOutDirectory, "TestStack.template.json"));

  await stack.waitForDeployComplete();

  const distributionId = stack.outputs.get("DistributionId")?.value;
  assertNonNullable(distributionId);

  return await simCfSiteRequest(simAws, distributionId as string, "/greeting");
}

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized Function URL, origin access control,
 * Distribution and Lambda permission through sim CloudFormation.
 *
 * This is the shape `origins.FunctionUrlOrigin.withOriginAccessControl()` has,
 * and the only way to put a Function URL behind a Distribution without leaving
 * the Function URL open to anyone who finds its endpoint.
 */
describe("Sim CDK CloudFront Function URL origin access control local integration", () => {
  it("serves an AWS_IAM Function URL through a Distribution with the grants CDK writes", async () => {
    // Given the CDK stack for a Function URL Origin with an origin access
    // control and nothing added, so the grants are the two CDK writes, the
    // second restricted to calls through the URL.
    const response = await fetchThroughCdkDistribution("");

    // Then the Origin request is admitted and the handler runs, with nothing
    // but the Distribution able to invoke the URL.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });

  it("serves it too with the Invoke grant an older CDK app adds by hand", async () => {
    // Given the same stack with an unrestricted `lambda:InvokeFunction` grant
    // beside the two CDK writes.
    const response = await fetchThroughCdkDistribution(
      invokeFunctionGrantSource,
    );

    // Then the extra grant changes nothing about who may reach the URL.
    assertResponseStatus(response, 200, await describeResponse(response));
  });
});
