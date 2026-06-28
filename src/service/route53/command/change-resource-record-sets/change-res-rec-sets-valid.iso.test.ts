import {
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimRoute53NoSuchHostedZone } from "../../error/sim-route53.error.js";
import {
  assertIsSimRoute53HostedZoneId,
  makeSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import type { SimRoute53Change } from "./change-resource-record-sets.cmd.js";
import type { SimRoute53 } from "../../sim-route53.js";

describe("ChangeResourceRecordSetsCommand validation", () => {
  async function createHostedZone(name: string): Promise<{
    simAws: SimAws;
    simRoute53: SimRoute53;
    hostedZoneId: SimRoute53HostedZoneId;
  }> {
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const createHostedZoneOutput = await simRoute53.createHostedZone({
      input: {
        Name: name,
        CallerReference: `${name}-test`,
      },
    });

    const hostedZoneId = createHostedZoneOutput.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    await simAws.backgroundTasksComplete();

    return { simAws, simRoute53, hostedZoneId };
  }

  it("throws when the Hosted Zone does not exist", async () => {
    // Given a missing Hosted Zone ID.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();
    const hostedZoneId = makeSimRoute53HostedZoneId();

    // When a change is submitted for the missing Hosted Zone.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets({
        input: {
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: "CREATE",
                ResourceRecordSet: {
                  Name: "www.missing.example.com",
                  Type: "A",
                  ResourceRecords: [{ Value: "192.0.2.9" }],
                },
              },
            ],
          },
        },
      }),
    );

    // Then Route53 reports that the Hosted Zone does not exist.
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
    assertStringIncludes(error.message, "No sim Route53 Hosted Zone with ID");
  });

  it("throws clear validation errors for missing required input fields", async () => {
    // Given a Hosted Zone and invalid change cases.
    const { simRoute53, hostedZoneId } = await createHostedZone(
      "invalid.example.com",
    );

    const invalidChanges: readonly {
      readonly change: SimRoute53Change;
      readonly expectedMessage: string;
    }[] = [
      {
        change: {
          ResourceRecordSet: {
            Name: "missing-action.invalid.example.com",
            Type: "A",
            ResourceRecords: [{ Value: "192.0.2.10" }],
          },
        },
        expectedMessage: "ChangeResourceRecordSetsCommand.Change.Action",
      },
      {
        change: {
          Action: "CREATE",
        },
        expectedMessage:
          "ChangeResourceRecordSetsCommand.Change.ResourceRecordSet",
      },
      {
        change: {
          Action: "CREATE",
          ResourceRecordSet: {
            Type: "A",
            ResourceRecords: [{ Value: "192.0.2.11" }],
          },
        },
        expectedMessage:
          "ChangeResourceRecordSetsCommand.ResourceRecordSet.Name",
      },
      {
        change: {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "missing-type.invalid.example.com",
            ResourceRecords: [{ Value: "192.0.2.12" }],
          },
        },
        expectedMessage:
          "ChangeResourceRecordSetsCommand.ResourceRecordSet.Type",
      },
      {
        change: {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "missing-records.invalid.example.com",
            Type: "A",
          },
        },
        expectedMessage:
          "ChangeResourceRecordSetsCommand.ResourceRecordSet.ResourceRecords",
      },
      {
        change: {
          Action: "CREATE",
          ResourceRecordSet: {
            Name: "missing-value.invalid.example.com",
            Type: "A",
            ResourceRecords: [{}],
          },
        },
        expectedMessage:
          "ChangeResourceRecordSetsCommand.ResourceRecordSet.ResourceRecords.Value",
      },
    ];

    for (const invalidChange of invalidChanges) {
      // When a malformed change is submitted.
      // eslint-disable-next-line no-await-in-loop
      const error = await assertThrowsErrorAsync(async () =>
        simRoute53.changeResourceRecordSets({
          input: {
            HostedZoneId: hostedZoneId,
            ChangeBatch: {
              Changes: [invalidChange.change],
            },
          },
        }),
      );

      // Then the relevant validation error is reported.
      assertStringIncludes(error.message, invalidChange.expectedMessage);
    }
  });

  it("throws when HostedZoneId or ChangeBatch.Changes is missing", async () => {
    // Given a simulated Route53 service with one Hosted Zone.
    const { simRoute53, hostedZoneId } = await createHostedZone(
      "missing-input.example.com",
    );

    // When HostedZoneId is missing.
    const missingHostedZoneIdError = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets({
        input: {
          ChangeBatch: {
            Changes: [],
          },
        },
      }),
    );

    // Then HostedZoneId validation fails.
    assertIdentical(
      missingHostedZoneIdError.message,
      "Not a SimRoute53HostedZoneId",
    );

    // When ChangeBatch.Changes is missing.
    const missingChangesError = await assertThrowsErrorAsync(async () =>
      simRoute53.changeResourceRecordSets({
        input: {
          HostedZoneId: hostedZoneId,
          ChangeBatch: {},
        },
      }),
    );

    // Then ChangeBatch.Changes validation fails.
    assertStringIncludes(
      missingChangesError.message,
      "ChangeResourceRecordSetsCommand.ChangeBatch.Changes",
    );
  });

  it("accepts a /hostedzone/ prefixed HostedZoneId", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simAws, simRoute53, hostedZoneId } = await createHostedZone(
      "prefixed.example.com",
    );

    // When a record is created using a /hostedzone/ prefixed HostedZoneId.
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: `/hostedzone/${hostedZoneId}`,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.prefixed.example.com",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "192.0.2.2" }],
              },
            },
          ],
        },
      },
    });
    await simAws.backgroundTasksComplete();

    // Then the record is applied to the existing Hosted Zone.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertObjectMatches(
      hostedZone?.records.get("www.prefixed.example.com", "A"),
      {
        values: ["192.0.2.2"],
        ttl: 60,
      },
    );
  });

  it("normalizes record names and non-TXT values while preserving TXT values", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simAws, simRoute53, hostedZoneId } = await createHostedZone(
      "normalize.example.com",
    );

    // When CNAME and TXT records are created with values requiring different normalization.
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.normalize.example.com.",
                Type: "CNAME",
                ResourceRecords: [{ Value: "target.normalize.example.com." }],
              },
            },
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "verify.normalize.example.com.",
                Type: "TXT",
                ResourceRecords: [
                  { Value: '"v=spf1 include:example.com ~all"' },
                ],
              },
            },
          ],
        },
      },
    });
    await simAws.backgroundTasksComplete();

    // Then DNS-like names are normalized but TXT content is preserved.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertObjectMatches(
      hostedZone?.records.get("www.normalize.example.com", "CNAME"),
      {
        name: "www.normalize.example.com",
        values: ["target.normalize.example.com"],
      },
    );
    assertObjectMatches(
      hostedZone.records.get("verify.normalize.example.com", "TXT"),
      {
        name: "verify.normalize.example.com",
        values: ['"v=spf1 include:example.com ~all"'],
      },
    );
  });
});
