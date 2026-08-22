import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  edgeCacheBehavior,
  edgeDistributionLogicalId,
  edgeDistributionTemplateFactory,
  edgeVersionLogicalId,
} from "../../../../../test/cloudfront/edge-distribution-template.factory.js";
import {
  simCfSiteBucket,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnDeployedStack } from "../../../cloudformation/stack/sim-cfn-deployed-stack.type.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

/**
 * A version ARN naming a function no simulated Lambda holds, which is what a
 * template pointing at a function in a real account leaves behind.
 */
const absentVersionArn =
  "arn:aws:lambda:us-east-1:111111111111:function:analytics-edge:3";

/**
 * The Distribution a deployed stack created.
 */
function deployedDistribution(
  stack: SimCfnDeployedStack,
): SimCloudFrontDistribution {
  const distribution = stack.getResource(
    edgeDistributionLogicalId,
  )?.simResource;
  assertInstanceOf(distribution, SimCloudFrontDistribution);

  return distribution;
}

describe("CloudFormation Distribution Lambda@Edge skips", () => {
  it("serves from a Distribution whose association named an absent function", async () => {
    // Given a Bucket holding the page the Distribution serves.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {
      "index.html": "<h1>Home</h1>",
    });

    // When a template whose Behavior names a function this simulation does not
    // hold deploys.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "edge-site",
      template: edgeDistributionTemplateFactory.make({
        associations: [
          {
            EventType: "viewer-request",
            LambdaFunctionARN: absentVersionArn,
          },
        ],
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Distribution deployed and serves the page itself, with the
    // association it could not run recorded.
    const distribution = deployedDistribution(stack);
    const response = await simCfSiteRequest(
      simAws,
      distribution.distributionId,
      "/index.html",
    );

    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Home</h1>");
    assertUndefined(distribution.behaviors[0]?.lambdaFunctionAssociations);

    const [ignoredProperty] = stack.ignoredProperties;
    assertNonNullable(ignoredProperty);
    assertIdentical(
      ignoredProperty.path,
      "DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.viewer-request",
    );
    assertStringIncludes(ignoredProperty.reason, absentVersionArn);
  });

  it("deploys the rest of a Behavior whose association is on an origin event", async () => {
    // Given a Bucket holding the page the edge function rewrites requests to.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {
      "edge.html": "<h1>Edge</h1>",
      "index.html": "<h1>Home</h1>",
    });

    // When a template whose Behavior runs the same function at the viewer and
    // at the Origin deploys.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "edge-site",
      template: edgeDistributionTemplateFactory.make({
        associations: [
          {
            EventType: "viewer-request",
            LambdaFunctionARN: { Ref: edgeVersionLogicalId },
          },
          {
            EventType: "origin-request",
            LambdaFunctionARN: { Ref: edgeVersionLogicalId },
          },
        ],
      }),
    });
    await stack.waitForDeployComplete();

    // Then the viewer-request function still runs, and the origin-request one
    // is recorded as the part that was left out.
    const response = await simCfSiteRequest(
      simAws,
      deployedDistribution(stack).distributionId,
      "/index.html",
    );

    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Edge</h1>");

    const [ignoredProperty] = stack.ignoredProperties;
    assertNonNullable(ignoredProperty);
    assertIdentical(
      ignoredProperty.path,
      "DistributionConfig.DefaultCacheBehavior.LambdaFunctionAssociations.origin-request",
    );
    assertStringIncludes(ignoredProperty.reason, "viewer-request");
  });

  it("records a skipped association under the Behavior's path pattern", async () => {
    // Given a Bucket holding the page a path-based Behavior serves.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {
      "images/logo.svg": "<svg />",
    });

    // When the Behavior for that path names a function this simulation does
    // not hold.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "edge-site",
      template: edgeDistributionTemplateFactory.make({
        associations: [],
        cacheBehaviors: [
          edgeCacheBehavior("/images/*", [
            {
              EventType: "viewer-response",
              LambdaFunctionARN: absentVersionArn,
            },
          ]),
        ],
      }),
    });
    await stack.waitForDeployComplete();

    // Then the Behavior serves its path, and the record names the pattern the
    // template wrote it under.
    const response = await simCfSiteRequest(
      simAws,
      deployedDistribution(stack).distributionId,
      "/images/logo.svg",
    );

    assertResponseStatus(response, 200);
    assertIdentical(
      stack.ignoredProperties[0]?.path,
      "DistributionConfig.CacheBehaviors./images/*.LambdaFunctionAssociations.viewer-response",
    );
  });

  it("fails the stack over a function outside us-east-1", async () => {
    // Given a template whose association names a function in the Region the
    // rest of the stack is in.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {});

    // When it deploys.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "edge-site",
        template: edgeDistributionTemplateFactory.make({
          associations: [
            {
              EventType: "viewer-request",
              LambdaFunctionARN:
                "arn:aws:lambda:eu-west-2:111111111111:function:edge-function:1",
            },
          ],
        }),
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment failed on the Region, as a real deploy fails on it,
    // rather than deploying a site missing the function it was written with.
    assertStringIncludes(error.message, "us-east-1");
  });

  it("fails the stack over an ARN naming no published version", async () => {
    // Given a template whose association names the function rather than a
    // version of it.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {});

    // When it deploys.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "edge-site",
        template: edgeDistributionTemplateFactory.make({
          associations: [
            {
              EventType: "viewer-request",
              LambdaFunctionARN: {
                "Fn::GetAtt": ["EdgeFunction", "Arn"],
              },
            },
          ],
        }),
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment failed on the qualifier, which is the mistake an
    // unpublished Lambda@Edge function is made with.
    assertStringIncludes(error.message, "published Lambda function version");
  });
});
