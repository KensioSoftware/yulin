import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  ListResourceRecordSetsCommand,
} from "@aws-sdk/client-route-53";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertThrowsErrorAsync,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimRoute53NoSuchHostedZone } from "../../error/sim-route53.error.js";
import { makeSimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";

describe("Route53 ListResourceRecordSetsCommand", () => {
  it("lists records sorted in DNS name order", async () => {
    // Given a Hosted Zone holding records created out of DNS name order.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const hostedZoneCreation = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.test",
        CallerReference: "dns-order-zone",
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
                Name: "www.example.test",
                Type: "CNAME",
                TTL: 300,
                ResourceRecords: [{ Value: "api.example.test" }],
              },
            },
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "b.api.example.test",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "127.0.0.1" }],
              },
            },
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "example.test",
                Type: "TXT",
                TTL: 900,
                ResourceRecords: [{ Value: "hello world" }],
              },
            },
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "api.example.test",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "127.0.0.1" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the Hosted Zone's record sets are listed.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );

    // Then records are ordered by DNS name, apex first, with trailing dots.
    assertArrayLength(output.ResourceRecordSets, 4);
    assertIdentical(output.ResourceRecordSets[0].Name, "example.test.");
    assertIdentical(output.ResourceRecordSets[1].Name, "api.example.test.");
    assertIdentical(output.ResourceRecordSets[2].Name, "b.api.example.test.");
    assertIdentical(output.ResourceRecordSets[3].Name, "www.example.test.");
    assertFalse(output.IsTruncated);
    assertIdentical(output.MaxItems, 100);
    assertObjectMatches(output.$metadata, {});
  });

  it("returns record type, TTL and values for a standard record", async () => {
    // Given a Hosted Zone with a multi-value TXT record.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const hostedZoneCreation = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "values.test",
        CallerReference: "values-zone",
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
                Name: "values.test",
                Type: "TXT",
                TTL: 120,
                ResourceRecords: [
                  { Value: "first value" },
                  { Value: "second value" },
                ],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the record sets are listed.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );

    // Then the record set carries its type, TTL and every stored value.
    assertArrayLength(output.ResourceRecordSets, 1);
    const recordSet = output.ResourceRecordSets[0];
    assertIdentical(recordSet.Type, "TXT");
    assertIdentical(recordSet.TTL, 120);
    assertArrayLength(recordSet.ResourceRecords, 2);
    assertIdentical(recordSet.ResourceRecords[0].Value, "first value");
    assertIdentical(recordSet.ResourceRecords[1].Value, "second value");
  });

  it("returns an alias record as an AliasTarget rather than resource records", async () => {
    // Given a Hosted Zone with an alias record pointing at a CloudFront hostname.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const hostedZoneCreation = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "alias.test",
        CallerReference: "alias-zone",
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
                Name: "cdn.alias.test",
                Type: "A",
                AliasTarget: {
                  HostedZoneId: "Z2FDTNDATAQYW2",
                  DNSName: "d111111abcdef8.cloudfront.net",
                  EvaluateTargetHealth: false,
                },
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the record sets are listed.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );

    // Then the alias target is returned instead of resource records.
    assertArrayLength(output.ResourceRecordSets, 1);
    const recordSet = output.ResourceRecordSets[0];
    assertIdentical(recordSet.Name, "cdn.alias.test.");
    assertIdentical(
      recordSet.AliasTarget?.DNSName,
      "d111111abcdef8.cloudfront.net.",
    );
    assertFalse(recordSet.AliasTarget.EvaluateTargetHealth);
    assertUndefined(recordSet.ResourceRecords);
  });

  it("returns an empty listing for a Hosted Zone with no records", async () => {
    // Given a newly created Hosted Zone.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const hostedZoneCreation = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "empty.test",
        CallerReference: "empty-zone",
      }),
    );
    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Hosted Zone ID");
    await simAws.backgroundTasksComplete();

    // When its record sets are listed.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({ HostedZoneId: hostedZoneId }),
    );

    // Then the listing is empty and not truncated.
    assertArrayEmpty(output.ResourceRecordSets);
    assertFalse(output.IsTruncated);
  });

  it("accepts a /hostedzone/ prefixed Hosted Zone ID", async () => {
    // Given a Hosted Zone with one record.
    const simAws = new SimAws();
    const route53 = simAws.route53();

    const hostedZoneCreation = await route53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "prefixed.test",
        CallerReference: "prefixed-zone",
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
                Name: "prefixed.test",
                Type: "A",
                TTL: 60,
                ResourceRecords: [{ Value: "127.0.0.1" }],
              },
            },
          ],
        },
      }),
    );
    await simAws.backgroundTasksComplete();

    // When the record sets are listed using the prefixed form of the ID.
    const output = await route53.listResourceRecordSets(
      new ListResourceRecordSetsCommand({
        HostedZoneId: `/hostedzone/${hostedZoneId}`,
      }),
    );

    // Then the same Hosted Zone is listed.
    assertArrayLength(output.ResourceRecordSets, 1);
    assertIdentical(output.ResourceRecordSets[0].Name, "prefixed.test.");
  });

  it("throws NoSuchHostedZone for an unknown Hosted Zone ID", async () => {
    // Given a simulated Route53 with no Hosted Zones.
    const simAws = new SimAws();
    const route53 = simAws.route53();
    const unknownHostedZoneId = makeSimRoute53HostedZoneId();

    // When record sets are listed for an ID that was never created.
    const error = await assertThrowsErrorAsync(async () =>
      route53.listResourceRecordSets(
        new ListResourceRecordSetsCommand({
          HostedZoneId: unknownHostedZoneId,
        }),
      ),
    );

    // Then Route53 reports the missing Hosted Zone with its ID.
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
    assertIdentical(error.$metadata.httpStatusCode, 404);
    assertIdentical(
      error.message,
      `No sim Route53 Hosted Zone with ID ${unknownHostedZoneId}`,
    );
  });
});
