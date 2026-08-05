import {
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import type { SimCloudFrontDistribution } from "../distribution/sim-cloudfront-distribution.js";
import type { SimCloudFrontFunctionName } from "../cff/sim-cloudfront-function.js";

const template = {
  Resources: {
    SiteBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "site-bucket" },
    },
    SiteFunction: {
      Type: "AWS::CloudFront::Function",
      Properties: {
        Name: "site-function",
        FunctionCode: "function handler(event) { return event.request; }",
      },
    },
    SiteDistribution: {
      Type: "AWS::CloudFront::Distribution",
      DependsOn: "SiteBucket",
      Properties: {
        DistributionConfig: {
          Enabled: true,
          Origins: {
            Items: [
              {
                Id: "SiteOrigin",
                DomainName: "site-bucket.s3.amazonaws.com",
                S3OriginConfig: {},
              },
            ],
          },
          DefaultCacheBehavior: {
            TargetOriginId: "SiteOrigin",
            ViewerProtocolPolicy: "redirect-to-https",
            FunctionAssociations: {
              Items: [
                {
                  EventType: "viewer-request",
                  FunctionARN: {
                    "Fn::GetAtt": ["SiteFunction", "FunctionARN"],
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};

describe("CloudFront CloudFormation Resource teardown", () => {
  it("disables a Distribution before deleting it", async () => {
    // Given a deployed Distribution, which CloudFront only accepts a deletion
    // for once it has been disabled.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "site-stack", template });
    await stack.waitForDeployComplete();

    const distribution = stack.resources.get("SiteDistribution")
      ?.simResource as SimCloudFrontDistribution | undefined;
    assertNonNullable(distribution);
    // The template asked for an enabled Distribution, so a teardown that only
    // called DeleteDistribution would be refused.

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the Distribution was disabled on its way out and is gone.
    assertFalse(distribution.enabled);
    assertUndefined(
      simAws.cloudFront().getSimDistributionById(distribution.distributionId),
    );
    assertIdentical(
      stack.resources.get("SiteDistribution")?.status,
      "DELETE_COMPLETE",
    );
  });

  it("deletes a CloudFront Function after the Distribution using it", async () => {
    // Given a deployed Distribution with a Function associated to a behaviour.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "function-stack", template });
    await stack.waitForDeployComplete();

    const functionName = "site-function" as SimCloudFrontFunctionName;
    assertNonNullable(
      simAws.cloudFront().getCloudFrontFunctionByName(functionName),
    );

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the Function is gone too, which only works because the Distribution
    // associating it went first.
    assertUndefined(
      simAws.cloudFront().getCloudFrontFunctionByName(functionName),
    );
    assertIdentical(
      stack.resources.get("SiteFunction")?.status,
      "DELETE_COMPLETE",
    );
  });
});
