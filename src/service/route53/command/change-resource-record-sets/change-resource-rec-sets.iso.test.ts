import {
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertObjectMatches,
  assertStringStartsWith,
  assertUndefined,
} from "@kensio/smartass";
import { SimFixedClock } from "../../../../util/clock/sim-clock.js";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimRoute53 } from "../../sim-route53.js";
import {
  assertIsSimRoute53HostedZoneId,
  type SimRoute53HostedZoneId,
} from "../create-hosted-zone/sim-route53-zone-id.js";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";

describe("Route53 ChangeResourceRecordSetsCommand", () => {
  async function createHostedZone(name: string): Promise<{
    simAws: SimAws;
    simRoute53: SimRoute53;
    hostedZoneId: SimRoute53HostedZoneId;
  }> {
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: name,
        CallerReference: `${name}-test`,
      }),
    );

    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    await simAws.backgroundTasksComplete();

    return { simAws, simRoute53, hostedZoneId };
  }

  it("creates an A record and returns PENDING ChangeInfo", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simAws, simRoute53, hostedZoneId } =
      await createHostedZone("example.com");

    // When an A record is created in the Hosted Zone.
    const changeOutput = await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    // Then the change output shows the async change is pending.
    assertStringStartsWith(
      changeOutput.ChangeInfo?.Id,
      `/change/${hostedZoneId}-`,
    );
    assertInstanceOf(changeOutput.ChangeInfo.SubmittedAt, Date);

    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertIdentical(hostedZone?.status, "PENDING");
    assertIdentical(hostedZone.records.count, 0);

    // When scheduled background work completes.
    await simAws.backgroundTasksComplete();

    // Then the Hosted Zone is INSYNC and the record is stored.
    assertIdentical(hostedZone.status, "INSYNC");
    assertIdentical(hostedZone.records.count, 1);
    assertObjectMatches(hostedZone.records.get("www.example.com", "A"), {
      name: "www.example.com",
      type: "A",
      values: ["192.0.2.1"],
    });
  });

  it("applies multiple changes in one ChangeBatch", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simAws, simRoute53, hostedZoneId } =
      await createHostedZone("batch.example.com");

    // When multiple records are created in one ChangeBatch.
    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then both records are stored and Hosted Zone record count is updated.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertIdentical(hostedZone?.records.count, 2);
    assertObjectMatches(hostedZone.records.get("one.batch.example.com", "A"), {
      values: ["192.0.2.3"],
    });
    assertObjectMatches(
      hostedZone.records.get("two.batch.example.com", "AAAA"),
      {
        values: ["2001:db8::1"],
      },
    );

    const hostedZoneOut = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({
        Id: hostedZoneId,
      }),
    );
    assertIdentical(hostedZoneOut.HostedZone?.ResourceRecordSetCount, 2);
  });

  it("upserts an existing record by replacing its values and TTL", async () => {
    // Given a Hosted Zone with an existing A record.
    const { simAws, simRoute53, hostedZoneId } =
      await createHostedZone("upsert.example.com");

    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    await simAws.backgroundTasksComplete();

    // When the same record name and type is upserted.
    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then the existing record is replaced rather than duplicated.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertIdentical(hostedZone?.records.count, 1);
    assertObjectMatches(hostedZone.records.get("www.upsert.example.com", "A"), {
      values: ["192.0.2.5"],
      ttl: 60,
    });
  });

  it("deletes records and treats deleting a missing record as a no-op", async () => {
    // Given a Hosted Zone with one existing A record.
    const { simRoute53, hostedZoneId } =
      await createHostedZone("delete.example.com");

    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    // When the existing record and another missing record are deleted.
    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    // Then the deleted A record is absent, and deleting the missing record did not fail.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertUndefined(hostedZone?.records.get("www.delete.example.com", "A"));
  });

  it("stores AliasTarget DNSName as the record value", async () => {
    // Given a Hosted Zone in simulated Route53.
    const { simAws, simRoute53, hostedZoneId } =
      await createHostedZone("alias.example.com");

    // When an alias record is created.
    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
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
      }),
    );

    await simAws.backgroundTasksComplete();

    // Then the alias DNSName is normalized and stored as the record value.
    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertObjectMatches(hostedZone?.records.get("app.alias.example.com", "A"), {
      values: ["dualstack.example-load-balancer.amazonaws.com"],
    });
  });

  it("gives each change its own id even on a stopped clock", async () => {
    // Given a Hosted Zone in a simulation whose clock never moves
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-07-26T09:30:00.000Z")),
    });
    const simRoute53 = simAws.route53();
    const creation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "stopped.example.com",
        CallerReference: "stopped-clock-test",
      }),
    );
    const hostedZoneId = creation.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);
    await simAws.backgroundTasksComplete();

    // When two changes are submitted at the same simulated instant
    const change = async (value: string): Promise<string | undefined> => {
      const output = await simRoute53.changeResourceRecordSets(
        new ChangeResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          ChangeBatch: {
            Changes: [
              {
                Action: "UPSERT",
                ResourceRecordSet: {
                  Name: "www.stopped.example.com",
                  Type: "A",
                  TTL: 300,
                  ResourceRecords: [{ Value: value }],
                },
              },
            ],
          },
        }),
      );
      await simAws.backgroundTasksComplete();

      return output.ChangeInfo?.Id;
    };
    const firstId = await change("192.0.2.1");
    const secondId = await change("192.0.2.2");

    // Then each change is still identifiable, as change ids do not come from
    // the clock
    assertStringStartsWith(firstId, `/change/${hostedZoneId}-`);
    assertStringStartsWith(secondId, `/change/${hostedZoneId}-`);
    assertFalse(firstId === secondId);
  });
});
