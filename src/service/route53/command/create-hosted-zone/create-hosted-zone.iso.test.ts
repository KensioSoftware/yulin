import {
  assertArrayLength,
  assertFalse,
  assertIdentical,
  assertInstanceOf,
  assertNonNullable,
  assertObjectMatches,
  assertOneOf,
  assertStringIncludes,
  assertStringStartsWith,
  assertThrowsErrorAsync,
  assertUndefined,
  oneOf,
} from "@kensio/smartass";
import { describe, it } from "vitest";
import { SimAws } from "../../../aws/sim-aws.js";
import { assertIsSimRoute53HostedZoneId } from "./sim-route53-zone-id.js";
import { SimRoute53HostedZoneAlreadyExists } from "../../error/sim-route53.error.js";
import {
  CreateHostedZoneCommand,
  GetHostedZoneCommand,
} from "@aws-sdk/client-route-53";

describe("Route53 CreateHostedZoneCommand", () => {
  it("creates a Hosted Zone in SimRoute53", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created.
    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.com",
        CallerReference: "test-caller-reference",
        HostedZoneConfig: {
          Comment: "Test hosted zone",
          PrivateZone: false,
        },
      }),
    );

    // Then the created Hosted Zone output contains the normalized zone details.
    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(hostedZoneId);
    assertStringStartsWith(hostedZoneId, "Z");

    assertObjectMatches(hostedZoneCreation.HostedZone, {
      Id: hostedZoneId,
      Name: "example.com.",
      CallerReference: "test-caller-reference",
      Config: {
        Comment: "Test hosted zone",
        PrivateZone: false,
      },
      ResourceRecordSetCount: 0,
    });

    assertObjectMatches(hostedZoneCreation.ChangeInfo, {
      Id: `/change/${hostedZoneId}`,
      Status: oneOf(["PENDING", "INSYNC"]),
    });
    assertInstanceOf(hostedZoneCreation.ChangeInfo.SubmittedAt, Date);

    assertNonNullable(hostedZoneCreation.DelegationSet);
    assertArrayLength(hostedZoneCreation.DelegationSet.NameServers, 4);
    assertIdentical(
      hostedZoneCreation.Location,
      `https://route53.sim-aws.localhost/2013-04-01/hostedzone/${hostedZoneId}`,
    );
    assertObjectMatches(hostedZoneCreation.$metadata, {});
  });

  it("creates a Hosted Zone without HostedZoneConfig", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created without optional config.
    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "example.org",
        CallerReference: "no-config-test",
      }),
    );

    // Then the Hosted Zone is created and config remains undefined.
    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Created Hosted Zone ID");

    assertObjectMatches(hostedZoneCreation.HostedZone, {
      Id: hostedZoneId,
      Name: "example.org.",
      CallerReference: "no-config-test",
      ResourceRecordSetCount: 0,
    });
    assertUndefined(hostedZoneCreation.HostedZone.Config);
  });

  it("stores the created Hosted Zone for later Route53 commands", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created.
    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "stored.example.com",
        CallerReference: "stored-zone-test",
        HostedZoneConfig: {
          Comment: "Stored hosted zone",
          PrivateZone: true,
        },
      }),
    );

    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertNonNullable(hostedZoneId, "Created Hosted Zone ID");

    // Then the Hosted Zone can be read back from the same SimRoute53 service.
    const hostedZoneOut = await simRoute53.getHostedZone(
      new GetHostedZoneCommand({
        Id: hostedZoneId,
      }),
    );

    assertObjectMatches(hostedZoneOut.HostedZone, {
      Id: hostedZoneId,
      Name: "stored.example.com.",
      CallerReference: "stored-zone-test",
      Config: {
        Comment: "Stored hosted zone",
        PrivateZone: true,
      },
      ResourceRecordSetCount: 0,
    });
  });

  it("creates distinct Hosted Zones for repeated names", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When two Hosted Zones are created with the same DNS name.
    const firstOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "duplicate.example.com",
        CallerReference: "first-duplicate-zone",
      }),
    );

    const secondOutput = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "duplicate.example.com",
        CallerReference: "second-duplicate-zone",
      }),
    );

    // Then both Hosted Zones are created with distinct IDs.
    const firstHostedZoneId = firstOutput.HostedZone?.Id;
    const secondHostedZoneId = secondOutput.HostedZone?.Id;
    assertNonNullable(firstHostedZoneId, "First Hosted Zone ID");
    assertNonNullable(secondHostedZoneId, "Second Hosted Zone ID");

    assertIdentical(firstOutput.HostedZone?.Name, "duplicate.example.com.");
    assertIdentical(secondOutput.HostedZone?.Name, "duplicate.example.com.");
    assertFalse(
      firstHostedZoneId === secondHostedZoneId,
      "Hosted Zone IDs should be distinct",
    );
  });

  it("throws when Name is missing", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created without a Name.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.createHostedZone({
        input: {
          CallerReference: "missing-name-test",
        },
      }),
    );

    // Then a clear validation error is thrown.
    assertStringIncludes(error.message, "CreateHostedZoneCommand.Name");
  });

  it("throws when CallerReference is missing", async () => {
    // Given a simulated Route53 service.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created without a CallerReference.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.createHostedZone({
        input: {
          Name: "missing-caller-reference.example.com",
        },
      }),
    );

    // Then a clear validation error is thrown.
    assertStringIncludes(
      error.message,
      "CreateHostedZoneCommand.CallerReference",
    );
  });

  it("moves the created Hosted Zone into INSYNC status as a background task", async () => {
    // Given a simulated AWS environment.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    // When a Hosted Zone is created.
    const hostedZoneCreation = await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "async.example.com",
        CallerReference: "async-zone-test",
      }),
    );

    // Then the immediate CreateHostedZone ChangeInfo is still pending.
    assertOneOf(hostedZoneCreation.ChangeInfo?.Status, ["PENDING", "INSYNC"]);

    const hostedZoneId = hostedZoneCreation.HostedZone?.Id;
    assertIsSimRoute53HostedZoneId(hostedZoneId);

    const hostedZone = simRoute53.hostedZones.get(hostedZoneId);
    assertNonNullable(hostedZone, "Created Hosted Zone");
    assertOneOf(hostedZone.status, ["PENDING", "INSYNC"]);

    // When scheduled background work completes.
    await simAws.backgroundTasksComplete();

    // Then the Hosted Zone has moved to INSYNC.
    assertIdentical(hostedZone.status, "INSYNC");
  });

  it("throws when a Hosted Zone already exists for the same caller reference", async () => {
    // Given a simulated Route53 service with an existing Hosted Zone.
    const simAws = new SimAws();
    const simRoute53 = simAws.route53();

    await simRoute53.createHostedZone(
      new CreateHostedZoneCommand({
        Name: "first.example.com",
        CallerReference: "duplicate-caller-reference",
      }),
    );

    // When another Hosted Zone is created with the same CallerReference.
    const error = await assertThrowsErrorAsync(async () =>
      simRoute53.createHostedZone({
        input: {
          Name: "second.example.com",
          CallerReference: "duplicate-caller-reference",
        },
      }),
    );

    // Then the duplicate CallerReference is rejected.
    assertInstanceOf(error, SimRoute53HostedZoneAlreadyExists);
    assertIdentical(error.name, "HostedZoneAlreadyExists");
    assertStringIncludes(error.message, "duplicate-caller-reference");
  });
});
