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
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized Distribution, function and
 * published version through sim CloudFormation.
 *
 * This is the CDK route a Lambda@Edge function reaches a Behavior by: a
 * `lambda.Version` in the same stack, handed to `edgeLambdas`. The stack is in
 * `us-east-1`, because that is the only Region CloudFront runs an edge
 * function from and the alternative,
 * `cloudfront.experimental.EdgeFunction`, reads its ARN back through a custom
 * resource in a second stack.
 */
describe("Sim CDK CloudFront Lambda@Edge local integration", () => {
  it("runs the version a CDK Behavior's edgeLambdas names", async () => {
    // Given a CDK stack whose Distribution runs a published version at the
    // viewer request, with an execution role Lambda@Edge can assume.
    const cdkProject = new TestCdkProject();

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "us-east-1" },
});

const siteBucket = new s3.Bucket(stack, "SiteBucket", {
  bucketName: "cdk-edge-site-bucket",
});

const edgeRole = new iam.Role(stack, "EdgeRole", {
  assumedBy: new iam.CompositePrincipal(
    new iam.ServicePrincipal("lambda.amazonaws.com"),
    new iam.ServicePrincipal("edgelambda.amazonaws.com"),
  ),
});

const edgeFunction = new lambda.Function(stack, "EdgeFunction", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  role: edgeRole,
  code: lambda.Code.fromInline(\`
exports.handler = async () => ({
  status: "200",
  headers: { "content-type": [{ key: "Content-Type", value: "text/html" }] },
  body: "<h1>Edge</h1>",
});
\`),
});

const distribution = new cloudfront.Distribution(stack, "SiteDistribution", {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
    edgeLambdas: [
      {
        functionVersion: edgeFunction.currentVersion,
        eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
      },
    ],
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
      "/index.html",
    );

    // Then the function answers the viewer itself, without the Origin being
    // read for a page the Bucket does not hold.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Edge</h1>");
  });

  it("runs an EdgeFunction a us-east-1 stack created directly", async () => {
    // Given a CDK stack in us-east-1 whose Distribution runs an
    // experimental.EdgeFunction, which the construct creates in this stack
    // rather than in a support stack of its own.
    const cdkProject = new TestCdkProject();

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "us-east-1" },
});

const siteBucket = new s3.Bucket(stack, "SiteBucket", {
  bucketName: "cdk-edge-function-bucket",
});

const edgeFunction = new cloudfront.experimental.EdgeFunction(stack, "EdgeFn", {
  runtime: lambda.Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: lambda.Code.fromInline(\`
exports.handler = async () => ({
  status: "200",
  headers: { "content-type": [{ key: "Content-Type", value: "text/html" }] },
  body: "<h1>Edge Function</h1>",
});
\`),
});

const distribution = new cloudfront.Distribution(stack, "SiteDistribution", {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
    edgeLambdas: [
      {
        functionVersion: edgeFunction.currentVersion,
        eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
      },
    ],
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
      "/index.html",
    );

    // Then the function runs at the viewer request, as it does for a
    // lambda.Version written by hand.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Edge Function</h1>");
  });
});
