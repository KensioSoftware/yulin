import path from "node:path";
import { PutObjectCommand } from "@aws-sdk/client-s3";
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
 * template file and deploys the synthesized Distribution, origin access control
 * and Bucket policy through sim CloudFormation.
 *
 * This is the shape a CDK static site actually has, and the one the simulator
 * is worth having for: the Bucket admits nothing but this Distribution, and the
 * page is served only because the Origin read carries the Distribution's ARN.
 */
describe("Sim CDK CloudFront origin access control local integration", () => {
  it("serves a page through a Distribution CDK gave an origin access control", async () => {
    // Given a CDK stack whose Distribution reaches its Bucket with an origin
    // access control, which writes the Bucket policy granting CloudFront.
    const cdkProject = new TestCdkProject();

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

const siteBucket = new s3.Bucket(stack, "SiteBucket", {
  bucketName: "cdk-oac-site-bucket",
});

const distribution = new cloudfront.Distribution(stack, "SiteDistribution", {
  defaultBehavior: {
    origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
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

    // And a page is put in the Bucket, which nothing but the Distribution may
    // read back.
    await simAws.s3().putObject(
      new PutObjectCommand({
        Bucket: "cdk-oac-site-bucket",
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

    // Then the Bucket policy CDK wrote admits the Origin read and the page is
    // served.
    assertResponseStatus(response, 200, await describeResponse(response));
    assertIdentical(await response.text(), "<h1>Home</h1>");
  });
});
