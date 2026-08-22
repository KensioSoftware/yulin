import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { UpdateDistributionCommand } from "@aws-sdk/client-cloudfront";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import {
  createEdgeDistribution,
  makeEdgeFunctionVersionArn,
  type SimCfBehaviorAssociations,
} from "../../../../test/cloudfront/edge-function-fixture.js";
import { simCfSiteBucket } from "../../../../test/cloudfront/site-fixture.js";

/**
 * The error creating a Distribution with these associations was refused with.
 */
async function refusalFor(
  simAws: SimAws,
  associations: SimCfBehaviorAssociations,
): Promise<Error> {
  return await assertThrowsErrorAsync(async () => {
    await createEdgeDistribution(simAws, associations);
  });
}

/**
 * The error refusing a viewer-request association naming this ARN.
 */
async function viewerRequestRefusal(functionArn: string): Promise<Error> {
  return await refusalFor(new SimAws(), {
    edge: [{ EventType: "viewer-request", LambdaFunctionARN: functionArn }],
  });
}

describe("Simulated CloudFront Lambda@Edge association refusals", () => {
  it("refuses an ARN that names no published version", async () => {
    const error = await viewerRequestRefusal(
      "arn:aws:lambda:us-east-1:000000000000:function:unversioned",
    );

    assertStringIncludes(error.name, "InvalidLambdaFunctionAssociation");
    assertStringIncludes(error.message, "published Lambda function version");
  });

  it("refuses an ARN qualified with an alias rather than a version", async () => {
    const error = await viewerRequestRefusal(
      "arn:aws:lambda:us-east-1:000000000000:function:aliased:live",
    );

    assertStringIncludes(error.message, "published Lambda function version");
  });

  it("refuses a function outside us-east-1", async () => {
    const error = await viewerRequestRefusal(
      "arn:aws:lambda:eu-west-2:000000000000:function:elsewhere:1",
    );

    assertStringIncludes(error.message, "eu-west-2");
    assertStringIncludes(error.message, "us-east-1");
  });

  it("refuses a version ARN naming no simulated function", async () => {
    const error = await viewerRequestRefusal(
      "arn:aws:lambda:us-east-1:000000000000:function:absent:1",
    );

    assertStringIncludes(error.message, "names no simulated Lambda function");
  });

  it("refuses an execution role that does not trust edgelambda.amazonaws.com", async () => {
    const simAws = new SimAws();
    const functionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "untrusted-edge",
      handler: (event: unknown) => event,
      trustedServices: ["lambda.amazonaws.com"],
    });

    const error = await refusalFor(simAws, {
      edge: [{ EventType: "viewer-request", LambdaFunctionARN: functionArn }],
    });

    assertStringIncludes(error.message, "edgelambda.amazonaws.com");
    assertStringIncludes(error.message, "AssumeRolePolicyDocument");
  });

  it("refuses an origin event type, which this simulation does not run", async () => {
    const simAws = new SimAws();
    const functionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "origin-request-edge",
      handler: (event: unknown) => event,
    });

    const error = await refusalFor(simAws, {
      edge: [{ EventType: "origin-request", LambdaFunctionARN: functionArn }],
    });

    assertStringIncludes(error.message, "origin-request");
    assertStringIncludes(error.message, "not simulated");
  });

  it("refuses a Behavior mixing a CloudFront Function and Lambda@Edge at the viewer events", async () => {
    const simAws = new SimAws();
    const functionArn = await makeEdgeFunctionVersionArn({
      simAws,
      functionName: "mixed-edge",
      handler: (event: unknown) => event,
    });

    const error = await refusalFor(simAws, {
      cff: [
        {
          EventType: "viewer-request",
          FunctionARN: "arn:aws:cloudfront::000000000000:function/greeter",
        },
      ],
      edge: [{ EventType: "viewer-response", LambdaFunctionARN: functionArn }],
    });

    assertStringIncludes(error.name, "InvalidLambdaFunctionAssociation");
    assertStringIncludes(error.message, "viewer-request");
    assertStringIncludes(error.message, "viewer-response");
  });

  it("refuses an association an UpdateDistribution adds, leaving the Distribution serving", async () => {
    // Given a Distribution created with no edge function.
    const simAws = new SimAws();
    await simCfSiteBucket(simAws, "edge-associations", {});
    const distributionId = await createEdgeDistribution(simAws, {});

    // When an update adds an association naming an unpublished function.
    const error = await assertThrowsErrorAsync(
      async () =>
        await simAws.cloudFront().updateDistribution(
          new UpdateDistributionCommand({
            Id: distributionId,
            DistributionConfig: {
              CallerReference: "updated",
              Enabled: true,
              Comment: "Updated",
              Origins: { Quantity: 0, Items: [] },
              DefaultCacheBehavior: {
                TargetOriginId: "site-origin",
                ViewerProtocolPolicy: "allow-all",
                LambdaFunctionAssociations: {
                  Quantity: 1,
                  Items: [
                    {
                      EventType: "viewer-request",
                      LambdaFunctionARN:
                        "arn:aws:lambda:us-east-1:000000000000:function:added",
                    },
                  ],
                },
              },
            },
          }),
        ),
    );

    // Then the update is refused for the same reason a create would be.
    assertStringIncludes(error.name, "InvalidLambdaFunctionAssociation");
    assertStringIncludes(error.message, "published Lambda function version");
  });
});
