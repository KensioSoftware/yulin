import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  DeleteHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";
import {
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import {
  SimRoute53HostedZoneNotEmpty,
  SimRoute53NoSuchHostedZone,
} from "../../error/sim-route53.error.js";
import type { SimRoute53 } from "../../sim-route53.js";

interface Zone {
  readonly simAws: SimAws;
  readonly simRoute53: SimRoute53;
  readonly zoneId: string;
}

async function givenHostedZone(name: string): Promise<Zone> {
  const simAws = new SimAws();
  const simRoute53 = simAws.route53();
  const created = await simRoute53.createHostedZone(
    new CreateHostedZoneCommand({ Name: name, CallerReference: name }),
  );
  await simAws.backgroundTasksComplete();
  assertNonNullable(created.HostedZone?.Id);

  return { simAws, simRoute53, zoneId: created.HostedZone.Id };
}

async function changeRecord(
  zone: Zone,
  action: "CREATE" | "DELETE",
  recordName: string,
): Promise<void> {
  await zone.simRoute53.changeResourceRecordSets(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: zone.zoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: action,
            ResourceRecordSet: {
              Name: recordName,
              Type: "A",
              TTL: 60,
              ResourceRecords: [{ Value: "127.0.0.1" }],
            },
          },
        ],
      },
    }),
  );
  await zone.simAws.backgroundTasksComplete();
}

describe("Route53 DeleteHostedZoneCommand", () => {
  it("deletes an empty Hosted Zone", async () => {
    // Given a Hosted Zone with no records in it.
    const zone = await givenHostedZone("disposable.test");

    // When the Hosted Zone is deleted.
    const output = await zone.simRoute53.deleteHostedZone(
      new DeleteHostedZoneCommand({ Id: zone.zoneId }),
    );

    // Then Route53 reports the change, and the zone is gone.
    assertIdentical(output.ChangeInfo.Status, "INSYNC");

    const error = await assertThrowsErrorAsync(async () =>
      zone.simRoute53.getHostedZone(
        new GetHostedZoneCommand({ Id: zone.zoneId }),
      ),
    );
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
  });

  it("refuses a Hosted Zone that still holds records", async () => {
    // Given a Hosted Zone with a record in it.
    const zone = await givenHostedZone("occupied.test");
    await changeRecord(zone, "CREATE", "www.occupied.test");

    // When the Hosted Zone is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      zone.simRoute53.deleteHostedZone(
        new DeleteHostedZoneCommand({ Id: zone.zoneId }),
      ),
    );

    // Then Route53 refuses, leaving the caller to remove the records first.
    assertInstanceOf(error, SimRoute53HostedZoneNotEmpty);
    assertIdentical(error.$metadata.httpStatusCode, 400);
  });

  it("deletes a Hosted Zone once its records have been removed", async () => {
    // Given a Hosted Zone whose only record has been deleted again.
    const zone = await givenHostedZone("emptied.test");
    await changeRecord(zone, "CREATE", "www.emptied.test");
    await changeRecord(zone, "DELETE", "www.emptied.test");

    // When the Hosted Zone is deleted.
    await zone.simRoute53.deleteHostedZone(
      new DeleteHostedZoneCommand({ Id: zone.zoneId }),
    );

    // Then it goes, because there is nothing left in it.
    const error = await assertThrowsErrorAsync(async () =>
      zone.simRoute53.getHostedZone(
        new GetHostedZoneCommand({ Id: zone.zoneId }),
      ),
    );
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
  });

  it("stops the Hosted Zone taking part in name resolution", async () => {
    // Given a Hosted Zone registered for resolution.
    const zone = await givenHostedZone("resolved.test");
    assertIdentical(zone.simRoute53.resolvableHostedZones().size, 1);

    // When the Hosted Zone is deleted.
    await zone.simRoute53.deleteHostedZone(
      new DeleteHostedZoneCommand({ Id: zone.zoneId }),
    );

    // Then it is out of the registry DNS resolution reads.
    assertIdentical(zone.simRoute53.resolvableHostedZones().size, 0);
  });

  it("rejects a Hosted Zone that does not exist", async () => {
    // Given a simulated Route53 without the requested Hosted Zone.
    const simRoute53 = new SimAws().route53();

    // When the missing Hosted Zone is deleted.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.deleteHostedZone(
        new DeleteHostedZoneCommand({ Id: "Z0000000000000000000A" }),
      ),
    );

    // Then Route53 answers with its missing-zone error.
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
  });

  it("denies a caller without DeleteHostedZone permission", async () => {
    // Given a Hosted Zone in a simulation with IAM.
    const zone = await givenHostedZone("protected.test");

    // When an anonymous caller deletes it.
    const error = await assertThrowsErrorAsync(async () =>
      zone.simRoute53.deleteHostedZone(
        new DeleteHostedZoneCommand({ Id: zone.zoneId }),
        { caller: { kind: "anonymous" } },
      ),
    );

    // Then IAM denies the removal action, and the zone stays.
    assertInstanceOf(error, SimIamAccessDenied);
    assertIdentical(error.action, "route53:DeleteHostedZone");

    const stillThere = await zone.simRoute53.getHostedZone(
      new GetHostedZoneCommand({ Id: zone.zoneId }),
    );
    assertNonNullable(stillThere.HostedZone);
    assertIdentical(stillThere.HostedZone.Name, "protected.test.");
  });
});
