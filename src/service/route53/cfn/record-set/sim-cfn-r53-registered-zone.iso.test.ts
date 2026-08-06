import {
  assertArrayEquals,
  assertArrayLength,
  assertIdentical,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../../aws/sim-aws.js";
import {
  testAnswerer,
  testQuestion,
} from "../../dns/answer/dns-answerer-test-query.js";
import { dnsRcodes } from "../../dns/dns-rcode.js";

// The Hosted Zone ID a CDK app using HostedZone.fromLookup bakes into every
// RecordSet of its synthesized template.
const lookedUpHostedZoneId = "Z0123456789ABCDEFGHIJ";

describe("Route53 CloudFormation RecordSet in a registered Hosted Zone", () => {
  it("deploys a RecordSet naming a Hosted Zone the simulation registered", async () => {
    // Given a simulated Route53 Hosted Zone registered with a looked-up ID.
    const simAws = new SimAws();

    simAws.route53().registerHostedZone({
      id: lookedUpHostedZoneId,
      name: "example.com",
    });

    // When a template whose RecordSet names that Hosted Zone ID is deployed.
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "route53-registered-zone-stack",
      template: {
        Resources: {
          SiteRecord: {
            Type: "AWS::Route53::RecordSet",
            Properties: {
              HostedZoneId: lookedUpHostedZoneId,
              Name: "www.example.com",
              Type: "A",
              TTL: "300",
              ResourceRecords: ["192.0.2.10"],
            },
          },
        },
      },
    });

    await stack.waitForDeployComplete();
    await simAws.backgroundTasksComplete();

    // Then the Stack deploys, and the record resolves through simulated DNS the
    // same as one in a Hosted Zone the template created.
    assertIdentical(stack.status, "CREATE_COMPLETE");
    assertIdentical(stack.getResource("SiteRecord")?.status, "CREATE_COMPLETE");

    const answer = testAnswerer(simAws).answer(
      testQuestion("www.example.com", "A"),
    );

    assertIdentical(answer.rcode, dnsRcodes.noError);
    assertArrayLength(answer.answers, 1);
    assertArrayEquals([...answer.answers[0].rdata], [192, 0, 2, 10]);
  });
});
