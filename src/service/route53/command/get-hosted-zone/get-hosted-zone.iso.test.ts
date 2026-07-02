import {
  assertArrayLength,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertStringIncludes,
  assertThrowsErrorAsync,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { SimRoute53NoSuchHostedZone } from "../../error/sim-route53.error.js";
import { makeSimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";
import {
  ChangeResourceRecordSetsCommand,
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";

describe("Route53 GetHostedZoneCommand", () => {
  it("gets an existing Hosted Zone created in SimRoute53", async () => {
    // Given a Hosted Zone created through the simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const createHostedZoneOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.com",
        CallerReference: "test-caller-reference",
        HostedZoneConfig: {
          Comment: "Test hosted zone",
          PrivateZone: false,
        },
      }),
    );

    const hostedZoneId = createHostedZoneOutput.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Created Hosted Zone ID");

    // When the Hosted Zone is requested by ID through SimRoute53.
    const getHostedZoneOutput = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({
        Id: hostedZoneId,
      }),
    );

    // Then the Hosted Zone details match the created Hosted Zone.
    assertObjectMatches(getHostedZoneOutput.HostedZone, {
      Id: hostedZoneId,
      Name: "example.com.",
      CallerReference: "test-caller-reference",
      Config: {
        Comment: "Test hosted zone",
        PrivateZone: false,
      },
      ResourceRecordSetCount: 0,
    });

    assertNonNullable(getHostedZoneOutput.DelegationSet);
    assertArrayLength(getHostedZoneOutput.DelegationSet.NameServers, 4);
    assertObjectMatches(getHostedZoneOutput.$metadata, {});
  });

  it("gets an existing Hosted Zone with its current ResourceRecordSetCount", async () => {
    // Given a Hosted Zone with a record created through another Route53 command.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    const createHostedZoneOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.org",
        CallerReference: "record-count-test",
      }),
    );

    const hostedZoneId = createHostedZoneOutput.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Created Hosted Zone ID");

    await simRoute53.changeResourceRecordSets(
      new ChangeResourceRecordSetsCommand({
        HostedZoneId: hostedZoneId,
        ChangeBatch: {
          Changes: [
            {
              Action: "CREATE",
              ResourceRecordSet: {
                Name: "www.example.org",
                Type: "A",
                TTL: 300,
                ResourceRecords: [{ Value: "192.0.2.1" }],
              },
            },
          ],
        },
      }),
    );

    await simAws.backgroundTasksComplete();

    // When the Hosted Zone is requested after the record change.
    const getHostedZoneOutput = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({
        Id: hostedZoneId,
      }),
    );

    // Then the Hosted Zone reports the current record count.
    assertIdentical(getHostedZoneOutput.HostedZone?.ResourceRecordSetCount, 1);
  });

  it("throws when the Hosted Zone does not exist", async () => {
    // Given an empty simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a missing Hosted Zone is requested.
    const hostedZoneId = makeSimRoute53HostedZoneId();
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.getHostedZone({
        input: {
          Id: `/hostedzone/${hostedZoneId}`,
        },
      }),
    );

    // Then Route53 reports that the Hosted Zone does not exist.
    assertInstanceOf(error, SimRoute53NoSuchHostedZone);
    assertStringIncludes(error.message, "No sim Route53 Hosted Zone with ID");
  });
});
