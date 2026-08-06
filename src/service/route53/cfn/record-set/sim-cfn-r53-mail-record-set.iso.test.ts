import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import { SimRoute53HostedZone } from "../../hosted-zone/sim-route53-hosted-zone.js";

describe("Route53 CloudFormation RecordSets for stored-only record types", () => {
  it("deploys an MX RecordSet and leaves it readable on the Hosted Zone", async () => {
    // Given a template pointing a zone's mail at a provider, which is a record
    // simulated DNS never answers a query for but a stack still carries.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "mail-stack",
      template: {
        Resources: {
          MailZone: {
            Type: "AWS::Route53::HostedZone",
            Properties: { Name: "example.test" },
          },
          MailRecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: { Ref: "MailZone" },
              Name: "example.test",
              Type: "MX",
              TTL: "3600",
              ResourceRecords: [
                "10 in1-smtp.messagingengine.com.",
                "20 in2-smtp.messagingengine.com.",
              ],
            },
          },
        },
      },
    });

    // When the Stack finishes deploying.
    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the RecordSet deployed rather than failing the Stack, and the record
    // is on the Hosted Zone with its preference numbers intact.
    assertIdentical(
      stack.resources.get("MailRecord")?.status,
      "CREATE_COMPLETE",
    );
    const hostedZone = stack.getResource("MailZone")?.simResource;
    assertInstanceOf(hostedZone, SimRoute53HostedZone);
    assertObjectMatches(hostedZone.records.get("example.test", "MX"), {
      name: "example.test",
      type: "MX",
      ttl: 3600,
      values: [
        "10 in1-smtp.messagingengine.com.",
        "20 in2-smtp.messagingengine.com.",
      ],
    });
  });
});
