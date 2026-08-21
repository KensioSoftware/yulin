import { assertIdentical, assertMapSize } from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

describe("Route53 CloudFormation Resource teardown", () => {
  it("removes the records before deleting the Hosted Zone", async () => {
    // Given a deployed Hosted Zone holding a record set. Route53 refuses to
    // delete a zone that still holds records, and has no delete command for a
    // record: it takes a DELETE change instead.
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
              ResourceRecords: ["203.0.113.1"],
            },
          },
        },
      },
    });
    await stack.waitForDeployComplete();

    assertMapSize(simAws.route53().hostedZones, 1);

    // When the Stack's Resources are torn down.
    await stack.teardown();

    // Then the zone is gone, which only happens once its record went first.
    assertMapSize(simAws.route53().hostedZones, 0);
    assertIdentical(stack.getResource("SiteRecord")?.status, "DELETE_COMPLETE");
    assertIdentical(stack.getResource("SiteZone")?.status, "DELETE_COMPLETE");
  });
});
