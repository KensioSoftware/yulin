import { assertStringIncludes, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";

describe("Route53 CloudFormation HostedZone", () => {
  it("fails with a helpful diagnostic when Hosted Zone Name is missing", async () => {
    // Given a CloudFormation template declaring a Route53 Hosted Zone without the
    // required Name property.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation, then deployment
    // fails with a Hosted Zone shape diagnostic.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "invalid-route53-hosted-zone-stack",
        template: {
          Resources: {
            InvalidZone: {
              Type: "AWS::Route53::HostedZone",
              Properties: {},
            },
          },
        },
      }),
    );

    assertStringIncludes(
      error.message,
      "Invalid AWS::Route53::HostedZone InvalidZone: Name must be a string",
    );
  });

  it("fails with a helpful diagnostic when HostedZoneConfig is not an object", async () => {
    // Given a CloudFormation template declaring a Route53 Hosted Zone with an
    // unusable HostedZoneConfig value.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation, then deployment
    // fails with a HostedZoneConfig shape diagnostic.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "invalid-route53-hosted-zone-config-stack",
        template: {
          Resources: {
            InvalidZone: {
              Type: "AWS::Route53::HostedZone",
              Properties: {
                Name: "invalid.example.test",
                HostedZoneConfig: "not-an-object",
              },
            },
          },
        },
      }),
    );

    assertStringIncludes(
      error.message,
      "Invalid AWS::Route53::HostedZone InvalidZone: HostedZoneConfig must be an object",
    );
  });

  it("errors on unknown GetAtt attribute name", async () => {
    // Given a CloudFormation template with an Output that references an unsupported
    // Hosted Zone attribute.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation, then Output
    // resolution fails with the Hosted Zone attribute diagnostic.
    const error = await assertThrowsErrorAsync(async () =>
      simAws.cloudFormation().deployTemplate({
        stackName: "route53-hosted-zone-unknown-getatt-stack",
        template: {
          Resources: {
            OutputZone: {
              Type: "AWS::Route53::HostedZone",
              Properties: {
                Name: "unknown-getatt.example.test",
              },
            },
          },
          Outputs: {
            UnsupportedHostedZoneAttribute: {
              Value: {
                "Fn::GetAtt": ["OutputZone", "UnsupportedAttribute"],
              },
            },
          },
        },
      }),
    );

    assertStringIncludes(
      error.message,
      "Unsupported AWS::Route53::HostedZone attribute UnsupportedAttribute",
    );
  });
});
