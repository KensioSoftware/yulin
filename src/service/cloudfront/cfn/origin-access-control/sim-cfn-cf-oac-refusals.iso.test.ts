import {
  assertInstanceOf,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import type { SimCfnTemplateValue } from "../../../cloudformation/template/value/sim-cfn-template-value.js";
import { SimCloudFrontOriginAccessControl } from "../../origin-access-control/sim-cf-origin-access-control.js";

/**
 * A Stack whose Distribution names an origin access control, deployed with
 * whatever the Origin should carry.
 */
async function deployFailingOrigin(
  origin: Record<string, SimCfnTemplateValue>,
): Promise<Error> {
  const simAws = new SimAws();

  return await assertThrowsErrorAsync(async () => {
    await simAws.cloudFormation().deployTemplate({
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
                Origins: [origin],
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
  });
}

describe("AWS::CloudFront::OriginAccessControl refusals", () => {
  it("refuses an Origin naming an origin access control that does not exist", async () => {
    // Given a Distribution whose Origin names an ID nothing created, which is
    // what a hand-written template gets wrong.
    const error = await deployFailingOrigin({
      Id: "SiteOrigin",
      DomainName: "site-bucket.s3.amazonaws.com",
      S3OriginConfig: {},
      OriginAccessControlId: "E1EXAMPLE12345",
    });

    // Then the Stack fails when the Distribution is created, naming the ID,
    // rather than the Origin quietly reading without one.
    assertStringIncludes(error.message, "E1EXAMPLE12345");
    assertStringIncludes(error.message, "does not exist");
  });

  it("refuses an origin access control on a custom Origin", async () => {
    // Given a custom Origin naming an origin access control, which every one
    // here signs for an S3 Origin rather than a custom one.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "oac-stack",
      template: {
        Resources: {
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
        },
      },
    });
    await stack.waitForDeployComplete();

    const originAccessControl = stack.resources.get("SiteOac")?.simResource;
    assertInstanceOf(originAccessControl, SimCloudFrontOriginAccessControl);

    // When a Distribution attaches it to a custom Origin.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "site-stack",
        template: {
          Resources: {
            SiteDistribution: {
              Type: "AWS::CloudFront::Distribution",
              Properties: {
                DistributionConfig: {
                  Enabled: true,
                  Origins: [
                    {
                      Id: "SiteOrigin",
                      DomainName: "api.example.test",
                      CustomOriginConfig: {
                        OriginProtocolPolicy: "https-only",
                      },
                      OriginAccessControlId: originAccessControl.id,
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
    });

    // Then it is refused rather than attached to an Origin it cannot sign for.
    assertStringIncludes(error.message, "custom Origin SiteOrigin");
    assertStringIncludes(error.message, "site-oac");
  });

  it("refuses a second origin access control claiming a name", async () => {
    // Given a template declaring two origin access controls with one name.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "oac-stack",
        template: {
          Resources: {
            FirstOac: {
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
            SecondOac: {
              Type: "AWS::CloudFront::OriginAccessControl",
              DependsOn: ["FirstOac"],
              Properties: {
                OriginAccessControlConfig: {
                  Name: "site-oac",
                  OriginAccessControlOriginType: "s3",
                  SigningBehavior: "always",
                  SigningProtocol: "sigv4",
                },
              },
            },
          },
        },
      });
    });

    // Then the second is refused, as CloudFront refuses it.
    assertStringIncludes(error.message, "site-oac already exists");
  });

  it("refuses an origin type it does not sign for", async () => {
    // Given a template asking for a Lambda Function URL origin access control.
    const simAws = new SimAws();

    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "oac-stack",
        template: {
          Resources: {
            ApiOac: {
              Type: "AWS::CloudFront::OriginAccessControl",
              Properties: {
                OriginAccessControlConfig: {
                  Name: "api-oac",
                  OriginAccessControlOriginType: "lambda",
                  SigningBehavior: "always",
                  SigningProtocol: "sigv4",
                },
              },
            },
          },
        },
      });
    });

    // Then the Stack fails naming the origin type, rather than deploying an
    // origin access control that behaves like an S3 one.
    assertStringIncludes(
      error.message,
      "Invalid AWS::CloudFront::OriginAccessControl ApiOac",
    );
    assertStringIncludes(error.message, "OriginAccessControlOriginType lambda");
  });
});
