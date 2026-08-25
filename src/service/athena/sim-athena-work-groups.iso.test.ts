import { faker } from "@faker-js/faker";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../aws/sim-aws.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";

describe("simulated Athena workgroups", () => {
  const workGroupName = (): string => `analytics-${faker.string.uuid()}`;

  it("hands back the configuration a workgroup was created with", async () => {
    // Given a workgroup created with the cost guardrail and results location
    // an analytics stack sets on one.
    const simAws = new SimAws();
    const name = workGroupName();
    const outputLocation = `s3://${faker.string.uuid()}/queries/`;

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Description: "Rainlytics access log queries",
        Configuration: {
          BytesScannedCutoffPerQuery: 10_000_000_000,
          EnforceWorkGroupConfiguration: true,
          PublishCloudWatchMetricsEnabled: true,
          ResultConfiguration: { OutputLocation: outputLocation },
        },
      },
    });

    // When it is read back.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: name } });

    // Then every setting comes back as the stack set it.
    const workGroup = read.WorkGroup;

    assertNonNullable(workGroup);

    const configuration = workGroup.Configuration;

    assertNonNullable(configuration);
    assertIdentical(workGroup.Name, name);
    assertIdentical(workGroup.State, "ENABLED");
    assertIdentical(workGroup.Description, "Rainlytics access log queries");
    assertIdentical(configuration.BytesScannedCutoffPerQuery, 10_000_000_000);
    assertTrue(configuration.EnforceWorkGroupConfiguration === true);
    assertTrue(configuration.PublishCloudWatchMetricsEnabled === true);
    assertIdentical(
      configuration.ResultConfiguration?.OutputLocation,
      outputLocation,
    );
  });

  it("dates a workgroup by the simulation's clock", async () => {
    // Given a simulation whose clock is stopped at a known instant, so a
    // created-at timestamp is the same on every run.
    const createdAt = new Date("2026-08-25T09:00:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(createdAt) });
    const name = workGroupName();

    // When a workgroup is created.
    await simAws.athena().createWorkGroup({ input: { Name: name } });

    // Then it carries that instant rather than the host clock's.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: name } });

    assertIdentical(
      read.WorkGroup?.CreationTime?.toISOString(),
      createdAt.toISOString(),
    );
  });

  it("starts every scope with the primary workgroup", async () => {
    // Given a fresh simulated account, which real Athena gives a primary
    // workgroup without anyone creating one.
    const simAws = new SimAws();

    // When the primary workgroup is read without being created, and a named
    // query is saved without naming a workgroup.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: "primary" } });

    await simAws.athena().createNamedQuery({
      input: { Name: "adhoc", Database: "logs", QueryString: "SELECT 1" },
    });

    // Then the workgroup is there, with no cutoff on it, and it is where a
    // request naming no workgroup lands.
    assertNonNullable(read.WorkGroup);
    assertIdentical(read.WorkGroup.Name, "primary");
    assertUndefined(read.WorkGroup.Configuration?.BytesScannedCutoffPerQuery);
    assertIdentical(
      simAws.athena().namedQueries()[0]?.workGroupName,
      "primary",
    );
  });

  it("keeps the fields an update leaves out", async () => {
    // Given a workgroup carrying both a cutoff and a results location.
    const simAws = new SimAws();
    const name = workGroupName();
    const outputLocation = `s3://${faker.string.uuid()}/queries/`;

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          BytesScannedCutoffPerQuery: 1_000_000,
          ResultConfiguration: { OutputLocation: outputLocation },
        },
      },
    });

    // When an update raises only the cutoff.
    await simAws.athena().updateWorkGroup({
      input: {
        WorkGroup: name,
        Description: "raised for the backfill",
        ConfigurationUpdates: { BytesScannedCutoffPerQuery: 5_000_000 },
      },
    });

    // Then the results location the update said nothing about is still there.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: name } });
    const configuration = read.WorkGroup?.Configuration;

    assertNonNullable(configuration);
    assertIdentical(configuration.BytesScannedCutoffPerQuery, 5_000_000);
    assertIdentical(
      configuration.ResultConfiguration?.OutputLocation,
      outputLocation,
    );
    assertIdentical(read.WorkGroup?.Description, "raised for the backfill");
  });

  it("clears the cutoff an update asks to remove", async () => {
    // Given a workgroup with a cutoff somebody now wants gone.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          BytesScannedCutoffPerQuery: 1_000_000,
          ResultConfiguration: {
            OutputLocation: "s3://results/",
            ExpectedBucketOwner: "888888888888",
          },
        },
      },
    });

    // When the update removes the cutoff and the results location.
    await simAws.athena().updateWorkGroup({
      input: {
        WorkGroup: name,
        State: "DISABLED",
        ConfigurationUpdates: {
          RemoveBytesScannedCutoffPerQuery: true,
          ResultConfigurationUpdates: { RemoveOutputLocation: true },
        },
      },
    });

    // Then both are gone, the expected bucket owner the update said nothing
    // about is kept, and the workgroup is disabled.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: name } });
    const configuration = read.WorkGroup?.Configuration;

    assertNonNullable(configuration);
    assertUndefined(configuration.BytesScannedCutoffPerQuery);
    assertUndefined(configuration.ResultConfiguration?.OutputLocation);
    assertIdentical(
      configuration.ResultConfiguration?.ExpectedBucketOwner,
      "888888888888",
    );
    assertIdentical(read.WorkGroup?.State, "DISABLED");
  });

  it("clears a field an update both removes and replaces", async () => {
    // Given a workgroup with a results location, and an update that names a
    // new one while also asking for the old one to go.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: {
            OutputLocation: "s3://results/",
            ExpectedBucketOwner: "888888888888",
            EncryptionConfiguration: { EncryptionOption: "SSE_S3" },
            AclConfiguration: { S3AclOption: "BUCKET_OWNER_FULL_CONTROL" },
          },
        },
      },
    });

    // When the update sets every removal flag and a replacement alongside it.
    await simAws.athena().updateWorkGroup({
      input: {
        WorkGroup: name,
        ConfigurationUpdates: {
          BytesScannedCutoffPerQuery: 5_000_000,
          RemoveBytesScannedCutoffPerQuery: true,
          ResultConfigurationUpdates: {
            OutputLocation: "s3://somewhere-else/",
            RemoveOutputLocation: true,
            ExpectedBucketOwner: "999999999999",
            RemoveExpectedBucketOwner: true,
            EncryptionConfiguration: { EncryptionOption: "SSE_KMS" },
            RemoveEncryptionConfiguration: true,
            AclConfiguration: { S3AclOption: "BUCKET_OWNER_FULL_CONTROL" },
            RemoveAclConfiguration: true,
          },
        },
      },
    });

    // Then every field is gone. A removal flag sets its field to null on real
    // Athena, whatever else the same update said about it.
    const workGroup = simAws.athena().findWorkGroup(name);

    assertNonNullable(workGroup);
    assertUndefined(workGroup.bytesScannedCutoffPerQuery);
    assertUndefined(workGroup.configuration.resultConfiguration);
  });

  it("drops a result configuration an update empties", async () => {
    // Given a workgroup whose result configuration says only where results go.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({
      input: {
        Name: name,
        Configuration: {
          ResultConfiguration: { OutputLocation: "s3://results/" },
        },
      },
    });

    // When that one field is removed.
    await simAws.athena().updateWorkGroup({
      input: {
        WorkGroup: name,
        ConfigurationUpdates: {
          ResultConfigurationUpdates: {
            RemoveOutputLocation: true,
            RemoveEncryptionConfiguration: true,
            RemoveAclConfiguration: true,
            RemoveExpectedBucketOwner: true,
          },
        },
      },
    });

    // Then the workgroup has no result configuration at all, rather than one
    // holding nothing.
    const read = await simAws
      .athena()
      .getWorkGroup({ input: { WorkGroup: name } });

    assertUndefined(read.WorkGroup?.Configuration?.ResultConfiguration);
  });

  it("lists the workgroups of a scope a page at a time", async () => {
    // Given more workgroups than one page carries, alongside primary.
    const simAws = new SimAws();
    const engineVersion = { SelectedEngineVersion: "Athena engine version 3" };

    await simAws.athena().createWorkGroup({
      input: {
        Name: workGroupName(),
        Configuration: { EngineVersion: engineVersion },
      },
    });
    await simAws.athena().createWorkGroup({
      input: {
        Name: workGroupName(),
        Configuration: { EngineVersion: engineVersion },
      },
    });
    await simAws.athena().createWorkGroup({
      input: {
        Name: workGroupName(),
        Configuration: { EngineVersion: engineVersion },
      },
    });

    // When the first two are listed and the token is followed.
    const first = await simAws
      .athena()
      .listWorkGroups({ input: { MaxResults: 2 } });
    const second = await simAws
      .athena()
      .listWorkGroups({ input: { NextToken: first.NextToken } });

    // Then the pages together hold primary and all three, and a listing
    // carries the engine version rather than the whole configuration.
    assertArrayLength(first.WorkGroups ?? [], 2);
    assertArrayLength(second.WorkGroups ?? [], 2);
    assertUndefined(second.NextToken);
    assertIdentical(first.WorkGroups?.[0]?.Name, "primary");
    assertIdentical(
      second.WorkGroups?.[1]?.EngineVersion?.EffectiveEngineVersion,
      "Athena engine version 3",
    );
  });

  it("forgets a deleted workgroup", async () => {
    // Given a workgroup a stack is about to take down.
    const simAws = new SimAws();
    const name = workGroupName();

    await simAws.athena().createWorkGroup({ input: { Name: name } });

    // When it is deleted.
    await simAws.athena().deleteWorkGroup({ input: { WorkGroup: name } });

    // Then nothing holds it any more.
    assertUndefined(simAws.athena().findWorkGroup(name));
  });
});
