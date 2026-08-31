import { describe, it } from "vitest";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  describeResponse,
} from "@kensio/smartass";
import { CreateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { PutObjectCommand } from "@aws-sdk/client-s3";

import { SimAws } from "../../../aws/sim-aws.js";
import type { CfnTemplateBodyRecord } from "../../../cloudformation/template/sim-cfn-template.js";
import type { SimCfnTemplateValueRecord } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { grantPublicObjectRead } from "../../../s3/bucket/sim-s3-public-read.fixture.js";
import { SimCloudFrontInvalidResponseHeadersPolicyId } from "../../error/sim-cloudfront.error.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";
import { simCfManagedResponseHeadersPolicyIds } from "../../response-headers-policy/sim-cf-managed-response-headers-policies.js";
import {
  simCfSiteBucket,
  simCfSiteDistributionConfig,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";

const bucketName = "held-policy-site-bucket";

/**
 * An ID that is neither a managed policy nor one a template created here,
 * which is what a policy ID from a real account looks like.
 */
const absentPolicyId = "11111111-2222-3333-4444-555555555555";

/** The pages the Distribution serves, keyed by Object key. */
const sitePages: Record<string, string> = {
  "index.html": "<h1>Home</h1>",
  "images/logo.html": "<img />",
};

/**
 * A template with a policy of its own and a Distribution, with the Behaviors
 * the test is about merged over the default one.
 */
function siteTemplate(
  distributionConfig: SimCfnTemplateValueRecord = {},
): CfnTemplateBodyRecord {
  return {
    Resources: {
      SiteBucket: {
        Type: "AWS::S3::Bucket",
        Properties: { BucketName: bucketName },
      },
      CacheHeaders: {
        Type: "AWS::CloudFront::ResponseHeadersPolicy",
        Properties: {
          ResponseHeadersPolicyConfig: {
            Name: "CacheHeaders",
            CustomHeadersConfig: {
              Items: [{ Header: "X-Site", Value: "held", Override: true }],
            },
          },
        },
      },
      SiteDistribution: {
        Type: "AWS::CloudFront::Distribution",
        DependsOn: ["SiteBucket", "CacheHeaders"],
        Properties: {
          DistributionConfig: {
            DefaultRootObject: "index.html",
            Enabled: true,
            Origins: [
              {
                Id: "SiteOrigin",
                DomainName: `${bucketName}.s3.amazonaws.com`,
                S3OriginConfig: { OriginAccessIdentity: "" },
              },
            ],
            DefaultCacheBehavior: {
              TargetOriginId: "SiteOrigin",
              ViewerProtocolPolicy: "allow-all",
              ResponseHeadersPolicyId: absentPolicyId,
            },
            ...distributionConfig,
          },
        },
      },
    },
  };
}

describe("CloudFormation Distribution on an absent response headers policy", () => {
  async function deployedSite(
    distributionConfig: SimCfnTemplateValueRecord = {},
  ): Promise<{
    simAws: SimAws;
    distributionId: string;
    ignoredPaths: readonly string[];
    ignoredReasons: readonly string[];
  }> {
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "held-policy-stack",
      template: siteTemplate(distributionConfig),
    });

    await stack.waitForDeployComplete();

    // The template creates the Bucket, so the pages go in after the deploy.
    await grantPublicObjectRead(simAws.s3(), bucketName);

    await Promise.all(
      Object.entries(sitePages).map(
        async ([key, body]) =>
          await simAws.s3().putObject(
            new PutObjectCommand({
              Bucket: bucketName,
              Key: key,
              ContentType: "text/html",
              Body: body,
            }),
          ),
      ),
    );

    const resource = stack.getResource("SiteDistribution");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimCloudFrontDistribution);

    return {
      simAws,
      distributionId: resource.simResource.distributionId,
      ignoredPaths: stack.ignoredProperties.map((ignored) => ignored.path),
      ignoredReasons: stack.ignoredProperties.map((ignored) => ignored.reason),
    };
  }

  it("deploys and serves a Distribution whose policy is not here", async () => {
    // Given a template naming a policy from some real account.
    // When the stack is deployed.
    const { simAws, distributionId } = await deployedSite();

    // Then the site is up, rather than the Distribution taking the stack down
    // over a set of headers.
    const home = await simCfSiteRequest(simAws, distributionId, "/");

    assertResponseStatus(home, 200, await describeResponse(home));
    assertIdentical(home.headers.get("x-site"), null);
  });

  it("records the dropped policy under the Behavior that named it", async () => {
    // Given the same template.
    const { ignoredPaths, ignoredReasons } = await deployedSite();

    // Then one property is recorded, naming the Behavior and the policy ID, so
    // a test that cares about the headers can read why they never arrived.
    assertArrayLength(ignoredPaths, 1);
    assertIdentical(
      ignoredPaths[0],
      "DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId",
    );
    assertStringIncludes(ignoredReasons[0] ?? "", absentPolicyId);
  });

  it("leaves the other Behaviors of the same Distribution holding theirs", async () => {
    // Given a Distribution whose path Behavior names a policy that is here and
    // whose default Behavior names one that is not.
    const { simAws, distributionId, ignoredPaths } = await deployedSite({
      CacheBehaviors: [
        {
          PathPattern: "/images/*",
          TargetOriginId: "SiteOrigin",
          ViewerProtocolPolicy: "allow-all",
          ResponseHeadersPolicyId: { Ref: "CacheHeaders" },
        },
      ],
    });

    // Then only the default Behavior lost its policy.
    assertArrayLength(ignoredPaths, 1);
    assertIdentical(
      ignoredPaths[0],
      "DistributionConfig.DefaultCacheBehavior.ResponseHeadersPolicyId",
    );

    // And the path Behavior still sets the header its policy names.
    const logo = await simCfSiteRequest(
      simAws,
      distributionId,
      "/images/logo.html",
    );

    assertIdentical(logo.headers.get("x-site"), "held");
  });

  it("records a path Behavior under its PathPattern", async () => {
    // Given a path Behavior naming a policy that is not here.
    const { ignoredPaths } = await deployedSite({
      CacheBehaviors: [
        {
          PathPattern: "/images/*",
          TargetOriginId: "SiteOrigin",
          ViewerProtocolPolicy: "allow-all",
          ResponseHeadersPolicyId: absentPolicyId,
        },
      ],
    });

    // Then it is recorded in the terms the template wrote it in, the way a
    // skipped Lambda@Edge association is.
    assertArrayLength(ignoredPaths, 2);
    assertIdentical(
      ignoredPaths[1],
      "DistributionConfig.CacheBehaviors./images/*.ResponseHeadersPolicyId",
    );
  });

  it("keeps a managed policy, which is one this simulation holds", async () => {
    // Given a Behavior naming SecurityHeadersPolicy.
    const { simAws, distributionId, ignoredPaths } = await deployedSite({
      DefaultCacheBehavior: {
        TargetOriginId: "SiteOrigin",
        ViewerProtocolPolicy: "allow-all",
        ResponseHeadersPolicyId:
          simCfManagedResponseHeadersPolicyIds.securityHeaders,
      },
    });

    // Then nothing is dropped and the policy is applied.
    assertArrayEmpty(ignoredPaths);

    const home = await simCfSiteRequest(simAws, distributionId, "/");

    assertIdentical(home.headers.get("x-frame-options"), "SAMEORIGIN");
  });

  it("still refuses the same policy ID on CreateDistribution", async () => {
    // Given a simulation holding no such policy.
    const simAws = new SimAws();

    await simCfSiteBucket(simAws, "create-refusal-bucket", {});

    // When the SDK command names it, then it is refused, as real CloudFront
    // refuses it. Only a Distribution deployed from a template is let through.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFront().createDistribution(
        new CreateDistributionCommand({
          DistributionConfig: simCfSiteDistributionConfig(
            "create-refusal-bucket",
            {
              DefaultCacheBehavior: {
                TargetOriginId: "site-origin",
                ViewerProtocolPolicy: "allow-all",
                ResponseHeadersPolicyId: absentPolicyId,
              },
            },
          ),
        }),
      );
    });

    assertInstanceOf(error, SimCloudFrontInvalidResponseHeadersPolicyId);
    assertStringIncludes(error.message, absentPolicyId);
  });
});
