import {
  assertArrayIncludes,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertTypeString,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";

describe("Route53 CloudFormation HostedZone", () => {
  it("creates a Route53 Hosted Zone from AWS::Route53::HostedZone", async () => {
    // Given a CloudFormation template declaring a Route53 Hosted Zone.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "route53-hosted-zone-stack",
      template: {
        Resources: {
          PublicZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "example.test",
              HostedZoneConfig: {
                Comment: "Example public hosted zone",
              },
            },
          },
        },
      },
    });

    // Then the CloudFormation Resource is backed by a simulated Hosted Zone.
    const resource = stack.getResource("PublicZone");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimRoute53HostedZone);

    const hostedZone = resource.simResource;

    assertIdentical(hostedZone.name, "example.test.");
    assertIdentical(hostedZone.callerReference, "PublicZone");
    assertIdentical(hostedZone.config?.Comment, "Example public hosted zone");
    assertIdentical(hostedZone.records.count, 0);
    assertIdentical(
      simAws.route53().hostedZones.get(hostedZone.id),
      hostedZone,
    );
  });

  it("creates multiple Hosted Zones and lists them by name", async () => {
    // Given a CloudFormation template declaring multiple Route53 Hosted Zones out
    // of lexical order.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    await simAws.cloudFormation().deployTemplate({
      stackName: "route53-multiple-hosted-zones-stack",
      template: {
        Resources: {
          ZZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "z.example.test",
            },
          },
          AZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "a.example.test",
            },
          },
          MZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "m.example.test",
            },
          },
        },
      },
    });

    // Then the created Hosted Zones are visible through the Route53 API in sorted
    // ListHostedZonesByName order.
    const listOutput = await simAws.route53().listHostedZonesByName({
      input: {},
    });

    assertArrayLength(listOutput.HostedZones, 3);
    assertIdentical(listOutput.HostedZones[0].Name, "a.example.test.");
    assertIdentical(listOutput.HostedZones[1].Name, "m.example.test.");
    assertIdentical(listOutput.HostedZones[2].Name, "z.example.test.");
    assertFalse(listOutput.IsTruncated);
  });

  it("uses Parameters in Hosted Zone properties", async () => {
    // Given a CloudFormation template whose Hosted Zone name and config are driven
    // by Parameters.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation with parameter
    // values.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "route53-hosted-zone-parameter-stack",
      template: {
        Parameters: {
          ZoneName: {
            Type: "String",
            Default: "default.example.test",
          },
          ZoneComment: {
            Type: "String",
            Default: "Default hosted zone comment",
          },
        },
        Resources: {
          ParameterZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: {
                Ref: "ZoneName",
              },
              HostedZoneConfig: {
                Comment: {
                  Ref: "ZoneComment",
                },
              },
            },
          },
        },
      },
      parameters: {
        ZoneName: "parameter.example.test",
        ZoneComment: "Parameter hosted zone comment",
      },
    });

    // Then the resolved Parameter values are used to create the Hosted Zone.
    const resource = stack.getResource("ParameterZone");

    assertNonNullable(resource);
    assertInstanceOf(resource.simResource, SimRoute53HostedZone);

    const hostedZone = resource.simResource;

    assertIdentical(hostedZone.name, "parameter.example.test.");
    assertIdentical(
      hostedZone.config?.Comment,
      "Parameter hosted zone comment",
    );
  });

  it("uses Hosted Zone ID for Ref and exposes Id and NameServers via Fn::GetAtt", async () => {
    // Given a CloudFormation template with a Hosted Zone, a dependent resource,
    // and Outputs that exercise Ref and Fn::GetAtt resolution.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "route53-hosted-zone-ref-stack",
      template: {
        Resources: {
          OutputZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "outputs.example.test",
            },
          },
          WaitHandle: {
            Type: "AWS::CloudFormation::WaitConditionHandle",
            Properties: {
              HostedZoneId: {
                Ref: "OutputZone",
              },
              HostedZoneIdAttribute: {
                "Fn::GetAtt": ["OutputZone", "Id"],
              },
              HostedZoneNameServersAttribute: {
                "Fn::GetAtt": ["OutputZone", "NameServers"],
              },
            },
          },
        },
        Outputs: {
          HostedZoneId: {
            Value: {
              Ref: "OutputZone",
            },
          },
          HostedZoneIdAttribute: {
            Value: {
              "Fn::GetAtt": ["OutputZone", "Id"],
            },
          },
          HostedZoneNameServersAttribute: {
            Value: {
              "Fn::GetAtt": ["OutputZone", "NameServers"],
            },
          },
        },
      },
    });

    // Then Ref returns the Hosted Zone ID, and Fn::GetAtt returns the supported
    // simulated Hosted Zone attributes.
    const hostedZoneResource = stack.getResource("OutputZone");
    const waitHandleResource = stack.getResource("WaitHandle");

    assertNonNullable(hostedZoneResource);
    assertNonNullable(waitHandleResource);

    const hostedZoneId = hostedZoneResource.refValue;

    assertTypeString(hostedZoneId);

    const resolvedWaitHandleProperties = waitHandleResource.resolvedProperties({
      resources: stack.resources,
    });

    assertIdentical(resolvedWaitHandleProperties["HostedZoneId"], hostedZoneId);
    assertIdentical(
      resolvedWaitHandleProperties["HostedZoneIdAttribute"],
      hostedZoneId,
    );

    assertIdentical(stack.outputs.get("HostedZoneId")?.value, hostedZoneId);
    assertIdentical(
      stack.outputs.get("HostedZoneIdAttribute")?.value,
      hostedZoneId,
    );
    assertArrayIncludes(
      stack.outputs.get("HostedZoneNameServersAttribute")?.value,
      "ns-3.sim-aws.localhost",
    );
  });

  it("supports duplicate Hosted Zone names with distinct logical IDs", async () => {
    // Given a CloudFormation template declaring two Hosted Zones with the same DNS
    // name.
    const simAws = new SimAws();

    // When the template is deployed through sim CloudFormation.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "route53-duplicate-hosted-zone-name-stack",
      template: {
        Resources: {
          FirstDuplicateZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "duplicate.example.test",
            },
          },
          SecondDuplicateZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: {
              Name: "duplicate.example.test",
            },
          },
        },
      },
    });

    // Then both Hosted Zones are created, using the logical IDs as distinct caller
    // references.
    const firstResource = stack.getResource("FirstDuplicateZone");
    const secondResource = stack.getResource("SecondDuplicateZone");

    assertNonNullable(firstResource);
    assertNonNullable(secondResource);
    assertInstanceOf(firstResource.simResource, SimRoute53HostedZone);
    assertInstanceOf(secondResource.simResource, SimRoute53HostedZone);

    const firstHostedZone = firstResource.simResource;
    const secondHostedZone = secondResource.simResource;

    assertIdentical(firstHostedZone.name, "duplicate.example.test.");
    assertIdentical(secondHostedZone.name, "duplicate.example.test.");
    assertIdentical(firstHostedZone.callerReference, "FirstDuplicateZone");
    assertIdentical(secondHostedZone.callerReference, "SecondDuplicateZone");

    const listOutput = await simAws.route53().listHostedZonesByName({
      input: {
        DNSName: "duplicate.example.test",
      },
    });

    assertArrayLength(listOutput.HostedZones, 2);
    assertIdentical(listOutput.HostedZones[0].Name, "duplicate.example.test.");
    assertIdentical(listOutput.HostedZones[1].Name, "duplicate.example.test.");
  });
});
