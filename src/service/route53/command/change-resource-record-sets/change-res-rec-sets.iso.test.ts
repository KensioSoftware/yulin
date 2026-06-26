import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringStartsWith,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimRoute53 } from "../../sim-route53.js";
import {
  assertIsSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";

describe("Route53 ChangeResourceRecordSetsCommand", () => {
  async function createHostedZone(
    name: string,
  ): Promise<{ simRoute53: SimRoute53; hostedZoneId: SimRoute53HostedZoneId }> {
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

    return { simRoute53, hostedZoneId };
  }

  it("creates an A record and returns INSYNC ChangeInfo", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simRoute53, hostedZoneId } = await createHostedZone("example.com");

    // When an A record is created in the Hosted Zone.
    const changeOutput = await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Comment: "Create web record",
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "192.0.2.1" }],
              },
            },
          ],
        },
      },
    });

    // Then the change output is successful and the record is stored.
    assertStringStartsWith(
      changeOutput.ChangeInfo?.Id ?? "",
      `/change/${hostedZoneId}-`,
    );
    assertIdentical(changeOutput.ChangeInfo?.Status, "INSYNC");
    assertInstanceOf(changeOutput.ChangeInfo.SubmittedAt, Date);
    assertObjectMatches(changeOutput.$metadata, {});

    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertNonNullable(hostedZone, "Stored Hosted Zone");
    assertIdentical(hostedZone.records.count, 1);
    assertObjectMatches(hostedZone.records.get("www.example.com", "A"), {
      name: "www.example.com",
      type: "A",
      values: ["192.0.2.1"],
      ttl: 300,
    });
  });

  it("applies multiple changes in one ChangeBatch", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simRoute53, hostedZoneId } =
      await createHostedZone("batch.example.com");

    // When multiple records are created in one ChangeBatch.
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "one.batch.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "192.0.2.3" }],
              },
            },
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "two.batch.example.com",
                Type: "AAAA",
                TTL: 300,
                ResourceRecords: [{ Value: "2001:db8::1" }],
              },
            },
          ],
        },
      },
    });

    // Then both records are stored and Hosted Zone record count is updated.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertNonNullable(hostedZone, "Stored Hosted Zone");
    assertIdentical(hostedZone.records.count, 2);
    assertObjectMatches(hostedZone.records.get("one.batch.example.com", "A"), {
      values: ["192.0.2.3"],
    });
    assertObjectMatches(
      hostedZone.records.get("two.batch.example.com", "AAAA"),
      {
        values: ["2001:db8::1"],
      },
    );

    const getHostedZoneOutput = await simRoute53.getHostedZone({
      input: {
        Id: hostedZoneId,
      },
    });
    assertIdentical(getHostedZoneOutput.HostedZone?.ResourceRecordSetCount, 2);
  });

  it("upserts an existing record by replacing its values and TTL", async () => {
    // Given a Hosted Zone with an existing A record.
    const { simRoute53, hostedZoneId } =
      await createHostedZone("upsert.example.com");

    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.upsert.example.com",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "192.0.2.4" }],
              },
            },
          ],
        },
      },
    });

    // When the same record name and type is upserted.
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "UPSERT",
              ResourceRecordSet: {
                Name: "www.upsert.example.com",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "192.0.2.5" }],
              },
            },
          ],
        },
      },
    });

    // Then the existing record is replaced rather than duplicated.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertNonNullable(hostedZone, "Stored Hosted Zone");
    assertIdentical(hostedZone.records.count, 1);
    assertObjectMatches(hostedZone.records.get("www.upsert.example.com", "A"), {
      values: ["192.0.2.5"],
      ttl: 60,
    });
  });

  it("deletes records and treats deleting a missing record as a no-op", async () => {
    // Given a Hosted Zone with one existing A record.
    const { simRoute53, hostedZoneId } =
      await createHostedZone("delete.example.com");

    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.delete.example.com",
                Type: "A",
                ResourceRecords: [{ Value: "192.0.2.6" }],
              },
            },
          ],
        },
      },
    });

    // When the existing record and another missing record are deleted.
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "DELETE",
              ResourceRecordSet: {
                Name: "www.delete.example.com",
                Type: "A",
                ResourceRecords: [{ Value: "192.0.2.6" }],
              },
            },
            {
              Action: "DELETE",
              ResourceRecordSet: {
                Name: "absent.delete.example.com",
                Type: "A",
                ResourceRecords: [{ Value: "192.0.2.7" }],
              },
            },
          ],
        },
      },
    });

    // Then the Hosted Zone is empty and deleting the missing record did not fail.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertNonNullable(hostedZone, "Stored Hosted Zone");
    assertIdentical(hostedZone.records.count, 0);
    assertUndefined(hostedZone.records.get("www.delete.example.com", "A"));
  });

  it("stores AliasTarget DNSName as the record value", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simRoute53, hostedZoneId } =
      await createHostedZone("alias.example.com");

    // When an alias record is created.
    await simRoute53.changeResourceRecordSets({
      input: {
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "app.alias.example.com",
                Type: "A",
                AliasTarget: {
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  DNSName: "dualstack.example-load-balancer.amazonaws.com.",
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
        },
      },
    });

    // Then the alias DNSName is normalized and stored as the record value.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertNonNullable(hostedZone, "Stored Hosted Zone");
    assertObjectMatches(hostedZone.records.get("app.alias.example.com", "A"), {
      values: ["dualstack.example-load-balancer.amazonaws.com"],
    });
  });
});
