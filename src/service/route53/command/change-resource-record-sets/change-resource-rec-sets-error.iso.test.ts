import {
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";

describe("Route53 ChangeResourceRecordSetsCommand errors", () => {
  it("throws when converting an unsupported ResourceRecordSet Type", async () => {
    // Given a Hosted Zone in simulated Route53.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "unsupported-type.example.com",
        CallerReference: "unsupported-type-test",
      }),
    );

    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Created Hosted Zone ID");

    await simAws.backgroundTasksComplete();

    // When a syntactically complete record change uses a Route53 type unsupported
    // by the simulator.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: "CREATE",
                ResourceRecordSet: {
                  Name: "sip.unsupported-type.example.com",
                  Type: "NAPTR",
                  TTL: 300,
                  ResourceRecords: [
                    {
                      Value:
                        '10 100 "S" "SIP+D2U" "" _sip._udp.unsupported-type.example.com.',
                    },
                  ],
                },
              },
            ],
          },
        }),
      ),
    );

    // Then validation reaches ResourceRecordSet conversion and rejects the type.
    assertIdentical(
      error.message,
      "Unsupported ChangeResourceRecordSetsCommand.ResourceRecordSet.Type NAPTR",
    );
    assertStringIncludes(
      error.message,
      "ChangeResourceRecordSetsCommand.ResourceRecordSet.Type",
    );
  });
});
