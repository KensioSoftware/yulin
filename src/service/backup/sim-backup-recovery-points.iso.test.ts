import { faker } from "@faker-js/faker";
import {
  BackupClient,
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  DescribeBackupJobCommand,
  DescribeBackupVaultCommand,
  DescribeRecoveryPointCommand,
  ListBackupJobsCommand,
  ListRecoveryPointsByBackupVaultCommand,
  PutBackupVaultLockConfigurationCommand,
  StartBackupJobCommand,
} from "@aws-sdk/client-backup";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimSdk } from "../../sdk/sim-sdk.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import { SimBackupResourceNotFoundException } from "./error/sim-backup.error.js";

describe("simulated AWS Backup recovery points", () => {
  it("creates one recovery point for each selected resource on schedule", async () => {
    // Given an hourly plan with two distinct selected resources.
    const createdAt = new Date("2026-08-31T09:30:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(createdAt) });
    const backup = simAws.backup();
    const vaultName = `vault-${faker.string.uuid()}`;
    const tableArn = `arn:aws:dynamodb:us-east-1:888888888888:table/${faker.string.uuid()}`;
    const bucketArn = `arn:aws:s3:::${faker.string.uuid()}`;
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    const plan = await backup.createBackupPlan(
      new CreateBackupPlanCommand({
        BackupPlan: {
          BackupPlanName: `plan-${faker.string.uuid()}`,
          Rules: [
            {
              RuleName: "hourly",
              TargetBackupVaultName: vaultName,
              ScheduleExpression: "rate(1 hour)",
              Lifecycle: { DeleteAfterDays: 30 },
            },
          ],
        },
      }),
    );
    assertNonNullable(plan.BackupPlanId);
    await backup.createBackupSelection(
      new CreateBackupSelectionCommand({
        BackupPlanId: plan.BackupPlanId,
        BackupSelection: {
          SelectionName: `selection-${faker.string.uuid()}`,
          IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
          Resources: [tableArn, bucketArn, tableArn],
        },
      }),
    );

    // When the simulated clock reaches two hourly occurrences.
    await simAws.clock().advanceBy({ hours: 2 });

    // Then each occurrence creates one point per distinct resource.
    const points = backup.vault(vaultName).recoveryPoints();
    assertArrayLength(points, 4);
    assertIdentical(
      points[0].creationDate.toISOString(),
      "2026-08-31T10:30:00.000Z",
    );
    assertIdentical(
      points[2].creationDate.toISOString(),
      "2026-08-31T11:30:00.000Z",
    );
    const jobs = await backup.listBackupJobs(new ListBackupJobsCommand({}));
    const backupJobs = jobs.BackupJobs ?? [];
    assertArrayLength(backupJobs, 4);
    assertIdentical(backupJobs[0].State, "COMPLETED");
    assertIdentical(backupJobs[0].CreatedBy?.BackupPlanId, plan.BackupPlanId);
  });

  it("expires a recovery point after its retention period", async () => {
    // Given a rule with one finite occurrence and a two-day lifecycle.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-08-31T23:59:00.000Z")),
    });
    const backup = simAws.backup();
    const vaultName = `vault-${faker.string.uuid()}`;
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    const plan = await backup.createBackupPlan(
      new CreateBackupPlanCommand({
        BackupPlan: {
          BackupPlanName: `plan-${faker.string.uuid()}`,
          Rules: [
            {
              RuleName: "once",
              TargetBackupVaultName: vaultName,
              ScheduleExpression: "cron(0 1 1 9 ? 2026)",
              Lifecycle: { DeleteAfterDays: 2 },
            },
          ],
        },
      }),
    );
    await backup.createBackupSelection(
      new CreateBackupSelectionCommand({
        BackupPlanId: plan.BackupPlanId,
        BackupSelection: {
          SelectionName: `selection-${faker.string.uuid()}`,
          IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
          Resources: [`arn:aws:s3:::${faker.string.uuid()}`],
        },
      }),
    );
    await simAws.clock().advanceBy({ hours: 1, minutes: 1 });
    const [point] = backup.vault(vaultName).recoveryPoints();
    assertNonNullable(point);

    // When its deletion instant passes.
    await simAws.clock().advanceBy({ days: 2 });

    // Then vault reads sweep the expired point from both access paths.
    assertArrayEmpty(backup.vault(vaultName).recoveryPoints());
    const listed = await backup.listRecoveryPointsByBackupVault(
      new ListRecoveryPointsByBackupVaultCommand({
        BackupVaultName: vaultName,
      }),
    );
    assertArrayEmpty(listed.RecoveryPoints ?? []);
    await expect(
      backup.describeRecoveryPoint(
        new DescribeRecoveryPointCommand({
          BackupVaultName: vaultName,
          RecoveryPointArn: point.arn,
        }),
      ),
    ).rejects.toBeInstanceOf(SimBackupResourceNotFoundException);
  });

  it("records a failed job when Vault Lock rejects rule retention", async () => {
    // Given a vault whose minimum retention exceeds the rule lifecycle.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-08-31T09:30:00.000Z")),
    });
    const backup = simAws.backup();
    const vaultName = `vault-${faker.string.uuid()}`;
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    await backup.putBackupVaultLockConfiguration(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: vaultName,
        MinRetentionDays: 7,
      }),
    );
    const plan = await backup.createBackupPlan(
      new CreateBackupPlanCommand({
        BackupPlan: {
          BackupPlanName: `plan-${faker.string.uuid()}`,
          Rules: [
            {
              RuleName: "hourly",
              TargetBackupVaultName: vaultName,
              ScheduleExpression: "rate(1 hour)",
              Lifecycle: { DeleteAfterDays: 3 },
            },
          ],
        },
      }),
    );
    await backup.createBackupSelection(
      new CreateBackupSelectionCommand({
        BackupPlanId: plan.BackupPlanId,
        BackupSelection: {
          SelectionName: `selection-${faker.string.uuid()}`,
          IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
          Resources: [`arn:aws:s3:::${faker.string.uuid()}`],
        },
      }),
    );

    // When the rule falls due.
    await simAws.clock().advanceBy({ hours: 1 });

    // Then it leaves a readable failed job and no recovery point.
    assertArrayEmpty(backup.vault(vaultName).recoveryPoints());
    const listed = await backup.listBackupJobs(new ListBackupJobsCommand({}));
    assertArrayLength(listed.BackupJobs ?? [], 1);
    const jobId = listed.BackupJobs?.[0]?.BackupJobId;
    assertNonNullable(jobId);
    const job = await backup.describeBackupJob(
      new DescribeBackupJobCommand({ BackupJobId: jobId }),
    );
    assertIdentical(job.State, "FAILED");
    assertStringIncludes(job.StatusMessage ?? "", "below the vault minimum");
  });

  it("creates on-demand points and exposes them through SDK commands", async () => {
    // Given an intercepted Backup client and a vault with bounded retention.
    const now = new Date("2026-08-31T12:00:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(now) });
    using simSdk = new SimSdk({ simAws });
    const client = new BackupClient({ region: "us-east-1" });
    simSdk.intercept(client);
    const vaultName = `vault-${faker.string.uuid()}`;
    const resourceArn = `arn:aws:s3:::${faker.string.uuid()}`;
    await client.send(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    await client.send(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: vaultName,
        MinRetentionDays: 7,
        MaxRetentionDays: 30,
      }),
    );

    // When an on-demand job uses retention inside the bounds.
    const started = await client.send(
      new StartBackupJobCommand({
        BackupVaultName: vaultName,
        ResourceArn: resourceArn,
        IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
        Lifecycle: { DeleteAfterDays: 14 },
      }),
    );
    assertNonNullable(started.BackupJobId);
    assertNonNullable(started.RecoveryPointArn);

    // Then the job, point and vault count are immediately readable.
    const job = await client.send(
      new DescribeBackupJobCommand({ BackupJobId: started.BackupJobId }),
    );
    assertIdentical(job.State, "COMPLETED");
    const point = await client.send(
      new DescribeRecoveryPointCommand({
        BackupVaultName: vaultName,
        RecoveryPointArn: started.RecoveryPointArn,
      }),
    );
    assertIdentical(point.ResourceArn, resourceArn);
    assertIdentical(point.CreationDate?.toISOString(), now.toISOString());
    assertIdentical(
      point.CalculatedLifecycle?.DeleteAt?.toISOString(),
      "2026-09-14T12:00:00.000Z",
    );
    const vault = await client.send(
      new DescribeBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    assertIdentical(vault.NumberOfRecoveryPoints, 1);

    const refused = await client.send(
      new StartBackupJobCommand({
        BackupVaultName: vaultName,
        ResourceArn: `arn:aws:s3:::${faker.string.uuid()}`,
        IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
        Lifecycle: { DeleteAfterDays: 31 },
      }),
    );
    assertNonNullable(refused.BackupJobId);
    const failed = await client.send(
      new DescribeBackupJobCommand({ BackupJobId: refused.BackupJobId }),
    );
    assertIdentical(failed.State, "FAILED");
    assertArrayLength(simAws.backup().vault(vaultName).recoveryPoints(), 1);
  });
});
