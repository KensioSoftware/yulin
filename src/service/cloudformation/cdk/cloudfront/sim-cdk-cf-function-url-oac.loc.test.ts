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
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized Function URL, origin access control,
 * Distribution and Lambda permission through sim CloudFormation.
 *
 * This is the shape `origins.FunctionUrlOrigin.withOriginAccessControl()` has,
 * and the only way to put a Function URL behind a Distribution without leaving
 * the Function URL open to anyone who finds its endpoint.
 */
describe("Sim CDK CloudFront Function URL origin access control local integration", () => {
  it("serves an AWS_IAM Function URL through a Distribution CDK gave an origin access control", async () => {
    // Given a CDK stack whose Distribution reaches a private Function URL with
    // an origin access control, which writes the invoke permission granting
    // CloudFront.
    const cdkProject = new TestCdkProject();

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
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

new cdk.CfnOutput(stack, "DistributionId", {
  value: distribution.distributionId,
});

app.synth();
`);

    // And the CDK app is synthesized to a CloudFormation template.
    const cdkOutDirectory = await cdkProject.synth();

    // When the synthesized template is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );

    await stack.waitForDeployComplete();

    const distributionId = stack.outputs.get("DistributionId")?.value;
    assertNonNullable(distributionId);

    const response = await simCfSiteRequest(
      simAws,
      distributionId as string,
      "/greeting",
    );

    // Then the permission CDK wrote admits the Origin request and the handler
    // runs, with nothing but the Distribution able to invoke the URL.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "Hello from behind CloudFront");
  });
});
