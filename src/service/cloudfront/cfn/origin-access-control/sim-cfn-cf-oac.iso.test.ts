import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";
import { SimCloudFrontS3Origin } from "../../origin/s3/sim-cloudfront-s3-origin.js";
import type { SimCloudFrontDistribution } from "../../distribution/sim-cloudfront-distribution.js";

/**
 * The template CDK synthesizes for an S3 origin site built with
 * `S3BucketOrigin.withOriginAccessControl`, which is what makes an
 * AWS::CloudFront::OriginAccessControl Resource.
 */
const template = {
  Resources: {
    SiteBucket: {
      Type: "AWS::S3::Bucket",
      Properties: { BucketName: "site-bucket" },
    },
    SiteOac: {
      Type: "AWS::CloudFront::OriginAccessControl",
      Properties: {
        OriginAccessControlConfig: {
          Name: "site-oac",
          OriginAccessControlOriginType: "s3",
          SigningBehavior: "always",
          SigningProtocol: "sigv4",
        },
      },
    },
    SiteDistribution: {
      Type: "AWS::CloudFront::Distribution",
      DependsOn: ["SiteBucket", "SiteOac"],
      Properties: {
        DistributionConfig: {
          Enabled: true,
          Origins: [
            {
              Id: "SiteOrigin",
              DomainName: "site-bucket.s3.amazonaws.com",
              S3OriginConfig: {},
              OriginAccessControlId: { Ref: "SiteOac" },
            },
          ],
          DefaultCacheBehavior: {
            TargetOriginId: "SiteOrigin",
            ViewerProtocolPolicy: "redirect-to-https",
          },
        },
      },
    },
  },
  Outputs: {
    OacId: { Value: { "Fn::GetAtt": ["SiteOac", "Id"] } },
    OacRef: { Value: { Ref: "SiteOac" } },
  },
};

describe("AWS::CloudFront::OriginAccessControl", () => {
  it("creates an origin access control sim CloudFront holds", async () => {
    // Given the template a modern S3 origin stack synthesizes.
    const simAws = new SimAws();

    // When it is deployed.
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "site-stack", template });
    await stack.waitForDeployComplete();

    // Then the Resource made a simulated origin access control, which sim
    // CloudFront holds by ID.
    const originAccessControl = stack.resources.get("SiteOac")?.simResource;
    assertInstanceOf(originAccessControl, SimCloudFrontOriginAccessControl);
    assertIdentical(
      simAws.cloudFront().getOriginAccessControlById(originAccessControl.id),
      originAccessControl,
    );
    assertIdentical(originAccessControl.name, "site-oac");
    assertIdentical(originAccessControl.signingBehavior, "always");
  });

  it("answers Ref and the Id attribute with the ID", async () => {
    // Given the deployed Stack.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "site-stack", template });
    await stack.waitForDeployComplete();

    const originAccessControl = stack.resources.get("SiteOac")?.simResource;
    assertInstanceOf(originAccessControl, SimCloudFrontOriginAccessControl);

    // Then both Outputs carry the origin access control's ID, which is what an
    // Origin's OriginAccessControlId names.
    assertIdentical(stack.outputs.get("OacRef")?.value, originAccessControl.id);
    assertIdentical(stack.outputs.get("OacId")?.value, originAccessControl.id);
  });

  it("resolves the origin access control an Origin names", async () => {
    // Given the deployed Stack.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "site-stack", template });
    await stack.waitForDeployComplete();

    const originAccessControl = stack.resources.get("SiteOac")?.simResource;
    assertInstanceOf(originAccessControl, SimCloudFrontOriginAccessControl);

    // Then the Origin holds the origin access control itself, rather than the
    // ID the template wrote.
    const distribution = stack.resources.get("SiteDistribution")
      ?.simResource as SimCloudFrontDistribution | undefined;
    assertNonNullable(distribution);

    const origin = distribution.getOrigin("SiteOrigin");
    assertInstanceOf(origin, SimCloudFrontS3Origin);
    assertIdentical(origin.originAccessControl, originAccessControl);
  });

  it("reports the OriginAccessControlId an Origin was created with", async () => {
    // Given the deployed Stack.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "site-stack", template });
    await stack.waitForDeployComplete();

    const originAccessControl = stack.resources.get("SiteOac")?.simResource;
    assertInstanceOf(originAccessControl, SimCloudFrontOriginAccessControl);

    const distribution = stack.resources.get("SiteDistribution")
      ?.simResource as SimCloudFrontDistribution | undefined;
    assertNonNullable(distribution);

    // When GetDistribution is called.
    const output = await simAws
      .cloudFront()
      .getDistribution({ input: { Id: distribution.distributionId } });

    // Then the Origin reports the resolved ID, so a test can assert the
    // association without reaching into the simulator.
    const [origin] =
      output.Distribution?.DistributionConfig?.Origins?.Items ?? [];
    assertNonNullable(origin);
    assertIdentical(origin.OriginAccessControlId, originAccessControl.id);
  });

  it("reads an empty OriginAccessControlId as no origin access control", async () => {
    // Given an Origin carrying the empty ID the CloudFront API uses to say an
    // Origin has none, rather than leaving the field out.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "site-stack",
      template: {
        Resources: {
          SiteBucket: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "site-bucket" },
          },
          SiteDistribution: {
            Type: "AWS::CloudFront::Distribution",
            DependsOn: ["SiteBucket"],
            Properties: {
              DistributionConfig: {
                Enabled: true,
                Origins: [
                  {
                    Id: "SiteOrigin",
                    DomainName: "site-bucket.s3.amazonaws.com",
                    S3OriginConfig: {},
                    OriginAccessControlId: "",
                  },
                ],
                DefaultCacheBehavior: {
                  TargetOriginId: "SiteOrigin",
                  ViewerProtocolPolicy: "redirect-to-https",
                },
              },
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    // Then the Origin is created with none, rather than the empty ID being
    // looked up and refused.
    const distribution = stack.resources.get("SiteDistribution")
      ?.simResource as SimCloudFrontDistribution | undefined;
    assertNonNullable(distribution);

    const origin = distribution.getOrigin("SiteOrigin");
    assertInstanceOf(origin, SimCloudFrontS3Origin);
    assertUndefined(origin.originAccessControl);
  });

  it("removes the origin access control when the Stack is torn down", async () => {
    // Given the deployed Stack.
    const simAws = new SimAws();
    const stack = await simAws
      .cloudFormation()
      .deployTemplate({ stackName: "site-stack", template });
    await stack.waitForDeployComplete();

    const originAccessControl = stack.resources.get("SiteOac")?.simResource;
    assertInstanceOf(originAccessControl, SimCloudFrontOriginAccessControl);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then sim CloudFront has forgotten it, and the Resource is gone.
    assertUndefined(
      simAws.cloudFront().getOriginAccessControlById(originAccessControl.id),
    );
    assertIdentical(stack.resources.get("SiteOac")?.status, "DELETE_COMPLETE");
  });
});
