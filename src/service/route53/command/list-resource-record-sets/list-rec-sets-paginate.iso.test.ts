import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import type { SimRoute53RecordType } from "../../record/sim-route53-record.js";

/**
 * Build a Hosted Zone holding four records across three names, so pagination
 * markers can be exercised against both the name and the record type.
 *
 * In DNS name order the records are:
 *
 * 1. markers.test    TXT
 * 2. a.markers.test  A
 * 3. a.markers.test  TXT
 * 4. b.markers.test  A
 */
async function createMarkersZone(
  simAws: SimAws,
  callerReference: string,
): Promise<string> {
  const route53 = simAws.route53();

  const hostedZoneCreation = await route53.createHostedZone(
    new CreateHostedZoneCommand({
      Name: "markers.test",
      CallerReference: callerReference,
    }),
  );
  const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
  assertNonNullable(hostedZoneId, "Hosted Zone ID");

  await route53.changeResourceRecordSets(
    new ChangeResourceRecordSetsCommand({
      HostedZoneId: hostedZoneId,
      ChangeBatch: {
        Changes: [
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "markers.test",
              Type: "TXT",
              TTL: 300,
              ResourceRecords: [{ Value: "apex" }],
            },
          },
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "a.markers.test",
              Type: "A",
              TTL: 60,
              ResourceRecords: [{ Value: "127.0.0.1" }],
            },
          },
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "a.markers.test",
              Type: "TXT",
              TTL: 300,
              ResourceRecords: [{ Value: "a text" }],
            },
          },
          {
            Action: "CREATE",
            ResourceRecordSet: {
              Name: "b.markers.test",
              Type: "A",
              TTL: 60,
              ResourceRecords: [{ Value: "127.0.0.2" }],
            },
          },
        ],
      },
    }),
  );
  await simAws.backgroundTasksComplete();

  return hostedZoneId;
}

describe("Route53 ListResourceRecordSetsCommand pagination", () => {
  it("paginates records using MaxItems and returns the next marker", async () => {
    // Given a Hosted Zone with more records than the requested page size.
    const simAws = new SimAws();
    const hostedZoneId = await createMarkersZone(simAws, "max-items-zone");

    // When record sets are listed with a two-item page size.
    const output = await simAws.route53().listResourceRecordSets(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        MaxItems: 2,
      }),
    );

    // Then only the first page is returned, marked with the next record.
    assertArrayLength(output.ResourceRecordSets, 2);
    assertIdentical(output.ResourceRecordSets[0].Name, "markers.test.");
    assertIdentical(output.ResourceRecordSets[1].Name, "a.markers.test.");
    assertIdentical(output.ResourceRecordSets[1].Type, "A");
    assertTrue(output.IsTruncated);
    assertIdentical(output.NextRecordName, "a.markers.test.");
    assertIdentical(output.NextRecordType, "TXT");
    assertIdentical(output.MaxItems, 2);
  });

  it("omits the next marker when the last page is returned", async () => {
    // Given a Hosted Zone listed with a page size covering every record.
    const simAws = new SimAws();
    const hostedZoneId = await createMarkersZone(simAws, "last-page-zone");

    // When record sets are listed with a page size larger than the record count.
    const output = await simAws.route53().listResourceRecordSets(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        MaxItems: 10,
      }),
    );

    // Then the listing is complete and carries no continuation marker.
    assertArrayLength(output.ResourceRecordSets, 4);
    assertFalse(output.IsTruncated);
    assertUndefined(output.NextRecordName);
    assertUndefined(output.NextRecordType);
  });

  it("continues from a StartRecordName marker", async () => {
    // Given a Hosted Zone with records before and after a name marker.
    const simAws = new SimAws();
    const hostedZoneId = await createMarkersZone(simAws, "start-name-zone");

    // When record sets are listed from a StartRecordName.
    const output = await simAws.route53().listResourceRecordSets(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        StartRecordName: "a.markers.test",
      }),
    );

    // Then records before that name are skipped, keeping both of its types.
    assertArrayLength(output.ResourceRecordSets, 3);
    assertIdentical(output.ResourceRecordSets[0].Name, "a.markers.test.");
    assertIdentical(output.ResourceRecordSets[0].Type, "A");
    assertIdentical(output.ResourceRecordSets[1].Type, "TXT");
    assertIdentical(output.ResourceRecordSets[2].Name, "b.markers.test.");
  });

  it("continues from a StartRecordName and StartRecordType marker", async () => {
    // Given a Hosted Zone where one name holds more than one record type.
    const simAws = new SimAws();
    const hostedZoneId = await createMarkersZone(simAws, "start-type-zone");

    // When record sets are listed from a name and type marker.
    const output = await simAws.route53().listResourceRecordSets(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        StartRecordName: "a.markers.test",
        StartRecordType: "TXT",
      }),
    );

    // Then the earlier record type at the same name is skipped.
    assertArrayLength(output.ResourceRecordSets, 2);
    assertIdentical(output.ResourceRecordSets[0].Name, "a.markers.test.");
    assertIdentical(output.ResourceRecordSets[0].Type, "TXT");
    assertIdentical(output.ResourceRecordSets[1].Name, "b.markers.test.");
  });

  it("normalises a StartRecordName marker for case and trailing dots", async () => {
    // Given a Hosted Zone listed from a marker in absolute, upper-case form.
    const simAws = new SimAws();
    const hostedZoneId = await createMarkersZone(simAws, "marker-format-zone");

    // When record sets are listed from that marker.
    const output = await simAws.route53().listResourceRecordSets(
      new ListResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        StartRecordName: "A.MARKERS.TEST.",
      }),
    );

    // Then the marker matches the same records as its normalised form.
    assertArrayLength(output.ResourceRecordSets, 3);
    assertIdentical(output.ResourceRecordSets[0].Name, "a.markers.test.");
  });

  it("walks every record across successive pages", async () => {
    // Given a Hosted Zone paged one record at a time.
    const simAws = new SimAws();
    const hostedZoneId = await createMarkersZone(simAws, "walk-pages-zone");
    const route53 = simAws.route53();
    const seenNames: string[] = [];

    // When each page is followed using the returned continuation marker.
    let startRecordName: string | undefined = undefined;
    let startRecordType: SimRoute53RecordType | undefined = undefined;

    for (let page = 0; page < 4; page += 1) {
      // oxlint-disable-next-line no-await-in-loop -- pagination is sequential: each page needs the previous page's marker
      const output = await route53.listResourceRecordSets(
        new ListResourceRecordSetsCommand({
          HostedZoneId: hostedZoneId,
          MaxItems: 1,
          StartRecordName: startRecordName,
          StartRecordType: startRecordType,
        }),
      );

      assertArrayLength(output.ResourceRecordSets, 1);
      seenNames.push(
        `${output.ResourceRecordSets[0].Name ?? ""} ${output.ResourceRecordSets[0].Type ?? ""}`,
      );
      startRecordName = output.NextRecordName;
      startRecordType = output.NextRecordType;
    }

    // Then every record is visited exactly once, in DNS name order.
    assertIdentical(seenNames[0], "markers.test. TXT");
    assertIdentical(seenNames[1], "a.markers.test. A");
    assertIdentical(seenNames[2], "a.markers.test. TXT");
    assertIdentical(seenNames[3], "b.markers.test. A");
    assertUndefined(startRecordName);
    assertUndefined(startRecordType);
  });
});
