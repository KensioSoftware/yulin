import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  describeResponse,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { simCfSiteRequest } from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth a cloud
 * assembly and deploys it through sim CloudFormation.
 *
 * `cloudfront.experimental.EdgeFunction` in a Stack outside us-east-1 is two
 * Stacks: the function and an SSM parameter holding its version ARN go into a
 * support Stack in us-east-1, and the Stack that uses it reads the parameter
 * back through a `Custom::CrossRegionStringParameterReader` Resource. The
 * Behavior's `LambdaFunctionARN` is an `Fn::GetAtt` on that Resource, so
 * nothing about the association reads as an ARN until both Stacks have
 * deployed.
 *
 * The us-east-1 case, where the construct creates the function alongside
 * everything else, is in `sim-cdk-cf-edge-lambda.loc.test.ts`.
 */
describe("Sim CDK CloudFront EdgeFunction across Regions local integration", () => {
  it("runs an EdgeFunction a Stack outside us-east-1 reads the ARN of", async () => {
    // Given a CDK app whose eu-west-1 Stack runs an EdgeFunction at the viewer
    // request, which puts the function in a us-east-1 support Stack of its
    // own.
    const cdkProject = await edgeFunctionProject("cdk-edge-region-bucket");

    // And the CDK app is synthesized to a cloud assembly of both Stacks.
    const cdkOutDirectory = await cdkProject.synth();

    // When the whole assembly is deployed through sim CloudFormation.
    const simAws = new SimAws();
    const stacks = await simAws.cloudFormation().deployCdkOut(cdkOutDirectory);

    const stack = stacks.get("TestStack");
    assertNonNullable(stack);
    await stack.waitForDeployComplete();

    const distributionId = stack.outputs.get("DistributionId")?.value;
    assertNonNullable(distributionId);

    const response = await simCfSiteRequest(
      simAws,
      distributionId as string,
      "/index.html",
    );

    // Then the ARN resolved to the version the support Stack published, and
    // the function answers the viewer itself.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Edge Function</h1>");

    // And nothing was reported as a gap. CDK's provider function for the
    // reader is left inert, because the read has already happened.
    assertArrayLength(stack.skippedResources, 0);
  });

  it("serves the site without the function when the support Stack is left out", async () => {
    // Given the same CDK app, synthesized to the same two Stacks.
    const cdkProject = await edgeFunctionProject("cdk-edge-region-only-bucket");
    const cdkOutDirectory = await cdkProject.synth();

    // When only the Stack using the EdgeFunction is deployed, so nothing has
    // written the SSM parameter its ARN is read from.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplateFile(
        path.join(cdkOutDirectory, "TestStack.template.json"),
      );

    await stack.waitForDeployComplete();

    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "cdk-edge-region-only-bucket",
        Key: "index.html",
        ContentType: "text/html",
        Body: "<h1>Home</h1>",
      }),
    );

    const distributionId = stack.outputs.get("DistributionId")?.value;
    assertNonNullable(distributionId);

    const response = await simCfSiteRequest(
      simAws,
      distributionId as string,
      "/index.html",
    );

    // Then the Distribution deployed without the association and serves the
    // Origin, rather than taking the Stack down over an ARN that never
    // arrived.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Home</h1>");

    // And the association it was deployed without is recorded with the reason.
    const skipped = stack.ignoredProperties.find((ignored) =>
      ignored.path.endsWith(
        "DefaultCacheBehavior.LambdaFunctionAssociations.viewer-request",
      ),
    );

    assertNonNullable(skipped);
    assertStringIncludes(skipped.reason, "had no ARN to answer with");
  });
});

/**
 * A CDK project whose eu-west-1 Stack answers the viewer request with an
 * EdgeFunction, over a Bucket of the given name.
 */
async function edgeFunctionProject(
  bucketName: string,
): Promise<TestCdkProject> {
  const cdkProject = new TestCdkProject();

  await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-1" },
});

const siteBucket = new s3.Bucket(stack, "SiteBucket", {
  bucketName: ${JSON.stringify(bucketName)},
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

  return cdkProject;
}
