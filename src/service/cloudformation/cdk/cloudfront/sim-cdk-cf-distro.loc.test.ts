import path from "node:path";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertTrue,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontDistribution } from "../../../cloudfront/distribution/sim-cloudfront-distribution.js";
import { TestCdkProject } from "../../../../util/filesystem/test-cdk-project.js";

/**
 * Slower local integration test. Calls the real CDK CLI to synth the output
 * template file and deploys the synthesized CloudFront Distribution through sim
 * CloudFormation.
 */
describe("Sim CDK CloudFront Distribution local integration", () => {
  it("deploys a CDK CloudFront Distribution through sim CloudFormation", async () => {
    // Given a CDK stack with an S3 Bucket and L1 CloudFront Distribution.
    const cdkProject = new TestCdkProject();

    await cdkProject.writeCdkAppFile(`
import * as cdk from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";

const app = new cdk.App();
const stack = new cdk.Stack(app, "TestStack", {
  env: { account: "111111111111", region: "eu-west-2" },
});

new s3.CfnBucket(stack, "SiteBucket", {
  bucketName: "cdk-cloudfront-site-bucket",
});

new cloudfront.CfnDistribution(stack, "SiteDistribution", {
  distributionConfig: {
    aliases: ["cdn.example.test"],
    enabled: true,
    origins: [
      {
        id: "SiteOrigin",
        domainName: "cdk-cloudfront-site-bucket.s3.amazonaws.com",
        s3OriginConfig: {},
      },
    ],
    defaultCacheBehavior: {
      targetOriginId: "SiteOrigin",
      viewerProtocolPolicy: "allow-all",
    },
  },
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

    // Then sim CloudFormation creates the simulated CloudFront Distribution.
    const distributionResource = stack.getResource("SiteDistribution");

    assertNonNullable(distributionResource);
    assertInstanceOf(
      distributionResource.simResource,
      SimCloudFrontDistribution,
    );

    const distribution = distributionResource.simResource;

    assertNonNullable(distribution);
    assertIdentical(distribution.status, "Deploying");
    assertTrue(distribution.hasAlternateDomainName("cdn.example.test"));
    assertNonNullable(distribution.getOrigin("SiteOrigin"));
    assertIdentical(
      simAws.cloudFront().getSimDistributionById(distribution.distributionId),
      distribution,
    );
  });
});
