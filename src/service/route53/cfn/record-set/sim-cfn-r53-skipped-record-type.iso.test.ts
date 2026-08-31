import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertMapSize,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";

describe("Route53 CloudFormation RecordSets with an unmodelled record type", () => {
  it("skips the RecordSet and deploys the rest of the Stack", async () => {
    // Given a zone carrying a DS record, which is a real Route53 record type
    // sim Route53 does not store, alongside the records a test is about.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "dns-stack",
      template: {
        Resources: {
          SiteZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: { Name: "example.test" },
          },
          SiteRecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: { Ref: "SiteZone" },
              Name: "www.example.test",
              Type: "A",
              TTL: "300",
              ResourceRecords: ["192.0.2.1"],
            },
          },
          MailRecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: { Ref: "SiteZone" },
              Name: "example.test",
              Type: "MX",
              TTL: "3600",
              ResourceRecords: ["10 in1-smtp.example.net."],
            },
          },
          DelegationSigner: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: { Ref: "SiteZone" },
              Name: "example.test",
              Type: "DS",
              TTL: "3600",
              ResourceRecords: ["12345 13 2 49FD46E6C4B45C55D4AC"],
            },
          },
        },
      },
    });

    // When the Stack finishes deploying.
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the unmodelled record is recorded as skipped, with a reason naming
    // the record type that was left out.
    assertArrayLength(stack.skippedResources, 1);
    const skipped = stack.skippedResources[0];
    assertNonNullable(skipped);
    assertIdentical(skipped.logicalId, "DelegationSigner");
    assertStringIncludes(
      skipped.skippedReason ?? "",
      "sim Route53 does not model the DS record type",
    );

    // And the records the test is about were created.
    assertIdentical(stack.getResource("SiteRecord")?.status, "CREATE_COMPLETE");
    const hostedZone = stack.getResource("SiteZone")?.simResource;
    assertInstanceOf(hostedZone, SimRoute53HostedZone);
    assertObjectMatches(hostedZone.records.get("www.example.test", "A"), {
      type: "A",
      values: ["192.0.2.1"],
    });
    assertObjectMatches(hostedZone.records.get("example.test", "MX"), {
      type: "MX",
      values: ["10 in1-smtp.example.net."],
    });
  });

  it("tears down a Stack holding a skipped RecordSet", async () => {
    // Given a deployed Stack whose DS record was skipped rather than created.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "signed-dns-stack",
      template: {
        Resources: {
          SiteZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: { Name: "example.test" },
          },
          SiteRecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: { Ref: "SiteZone" },
              Name: "www.example.test",
              Type: "A",
              TTL: "300",
              ResourceRecords: ["192.0.2.1"],
            },
          },
          DelegationSigner: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: { Ref: "SiteZone" },
              Name: "example.test",
              Type: "DS",
              TTL: "3600",
              ResourceRecords: ["12345 13 2 49FD46E6C4B45C55D4AC"],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // When the Stack is torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then the teardown ran to the end, taking the created record and its zone
    // with it. The zone only goes if its records went first, because
    // DeleteHostedZone refuses a zone that still holds records.
    assertIdentical(stack.getResource("SiteRecord")?.status, "DELETE_COMPLETE");
    assertIdentical(stack.getResource("SiteZone")?.status, "DELETE_COMPLETE");
    assertMapSize(simAws.route53().hostedZones, 0);

    // And the skipped record is delete-complete without a service being asked
    // to remove a record it never stored, so nothing was left behind. The skip
    // is still on the Stack to be read after the teardown.
    assertIdentical(
      stack.getResource("DelegationSigner")?.status,
      "DELETE_COMPLETE",
    );
    assertArrayEmpty(stack.skippedResourceDeletions);
    assertArrayLength(stack.skippedResources, 1);
  });

  it("still fails a Stack whose RecordSet is malformed", async () => {
    // Given a RecordSet whose Type says nothing about which record was wanted,
    // which is a broken template rather than a gap in the simulation.
    const simAws = new SimAws();

    // When the Stack is deployed.
    const error = await assertThrowsErrorAsync(async () => {
      const stack = await simAws.cloudFormation().deployTemplate({
        stackName: "broken-dns-stack",
        template: {
          Resources: {
            SiteZone: {
              Type: "AWS::Route53::HostedZone",
              Properties: { Name: "example.test" },
            },
            SiteRecord: {
              Type: "AWS::Route53::RecordSet",
              Properties: {
                HostedZoneId: { Ref: "SiteZone" },
                Name: "www.example.test",
                TTL: "300",
                ResourceRecords: ["192.0.2.1"],
              },
            },
          },
        },
      });
      await stack.waitForDeployComplete();
    });

    // Then the deployment is refused rather than skipped.
    assertStringIncludes(error.message, "Type must be a non-empty string");
  });
});
