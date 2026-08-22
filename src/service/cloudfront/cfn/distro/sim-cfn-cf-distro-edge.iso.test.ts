import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertResponseStatus,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import {
  edgeDistributionLogicalId,
  edgeDistributionTemplateFactory,
  edgeVersionLogicalId,
} from "../../../../../test/cloudfront/edge-distribution-template.factory.js";
import {
  simCfSiteBucket,
  simCfSiteRequest,
} from "../../../../../test/cloudfront/site-fixture.js";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimLambdaFunction } from "../../../lambda/function/sim-lambda-function.js";
import { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

describe("CloudFormation Distribution Lambda@Edge associations", () => {
  it("runs the function version a Behavior's association names", async () => {
    // Given a Bucket holding the page the edge function rewrites requests to.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {
      "edge.html": "<h1>Edge</h1>",
      "index.html": "<h1>Home</h1>",
    });

    // When a template whose Behavior associates a published version deploys.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "edge-site",
      template: edgeDistributionTemplateFactory.make(),
    });
    await stack.waitForDeployComplete();

    // Then the Distribution runs the function at the viewer request.
    const distribution = stack.getResource(
      edgeDistributionLogicalId,
    )?.simResource;
    assertInstanceOf(distribution, SimCloudFrontDistribution);

    const response = await simCfSiteRequest(
      simAws,
      distribution.distributionId,
      "/index.html",
    );

    assertResponseStatus(response, 200);
    assertIdentical(await response.text(), "<h1>Edge</h1>");
  });

  it("binds the version ARN the association's Ref resolves to", async () => {
    // Given a deployed template naming its published version by Ref.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-site", {
      "edge.html": "<h1>Edge</h1>",
    });

    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "edge-site",
      template: edgeDistributionTemplateFactory.make(),
    });
    await stack.waitForDeployComplete();

    // When the Behavior's association is read.
    const distribution = stack.getResource(
      edgeDistributionLogicalId,
    )?.simResource;
    assertInstanceOf(distribution, SimCloudFrontDistribution);

    const association =
      distribution.behaviors[0]?.lambdaFunctionAssociations?.viewerRequest;

    // Then it holds the qualified ARN of the version the template published,
    // which is what AWS::Lambda::Version answers a Ref with.
    const version = stack.getResource(edgeVersionLogicalId)?.simResource;
    assertInstanceOf(version, SimLambdaFunction);
    assertNonNullable(association);
    assertIdentical(association.functionArn, version.arn);
    assertIdentical(version.version, "1");
  });
});
