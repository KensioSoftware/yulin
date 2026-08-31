import { faker } from "@faker-js/faker";
import {
  CreateBackupVaultCommand,
  ListBackupJobsCommand,
  StartBackupJobCommand,
} from "@aws-sdk/client-backup";
import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";
import { SimBackupInvalidParameterValueException } from "../error/sim-backup.error.js";

describe("simulated AWS Backup job commands", () => {
  it("reuses an on-demand job for the same idempotency token", async () => {
    // Given an on-demand backup request with a customer token.
    const simAws = new SimAws();
    const backup = simAws.backup();
    const vaultName = `vault-${faker.string.uuid()}`;
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    const command = new StartBackupJobCommand({
      BackupVaultName: vaultName,
      ResourceArn: `arn:aws:s3:::${faker.string.uuid()}`,
      IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
      IdempotencyToken: faker.string.uuid(),
    });

    // When the successful request is retried with the same token.
    const first = await backup.startBackupJob(command);
    const retried = await backup.startBackupJob(command);

    // Then AWS Backup returns the original job without another recovery point.
    assertNonNullable(first.BackupJobId);
    assertIdentical(retried.BackupJobId, first.BackupJobId);
    assertIdentical(retried.RecoveryPointArn, first.RecoveryPointArn);
    assertArrayLength(backup.vault(vaultName).recoveryPoints(), 1);
    const jobs = await backup.listBackupJobs(new ListBackupJobsCommand({}));
    assertArrayLength(jobs.BackupJobs ?? [], 1);
  });

  it("paginates jobs after applying the request filters", async () => {
    // Given two jobs in one vault with a job from another vault between them.
    const simAws = new SimAws();
    const backup = simAws.backup();
    const vaultName = `vault-${faker.string.uuid()}`;
    const otherVaultName = `vault-${faker.string.uuid()}`;
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: otherVaultName }),
    );
    const firstResourceArn = `arn:aws:s3:::${faker.string.uuid()}`;
    const secondResourceArn = `arn:aws:s3:::${faker.string.uuid()}`;
    const roleArn = "arn:aws:iam::888888888888:role/BackupRole";
    await backup.startBackupJob(
      new StartBackupJobCommand({
        BackupVaultName: vaultName,
        ResourceArn: firstResourceArn,
        IamRoleArn: roleArn,
      }),
    );
    await backup.startBackupJob(
      new StartBackupJobCommand({
        BackupVaultName: otherVaultName,
        ResourceArn: `arn:aws:s3:::${faker.string.uuid()}`,
        IamRoleArn: roleArn,
      }),
    );
    await backup.startBackupJob(
      new StartBackupJobCommand({
        BackupVaultName: vaultName,
        ResourceArn: secondResourceArn,
        IamRoleArn: roleArn,
      }),
    );

    // When the matching jobs are read one at a time.
    const first = await backup.listBackupJobs(
      new ListBackupJobsCommand({
        ByBackupVaultName: vaultName,
        MaxResults: 1,
      }),
    );
    assertNonNullable(first.NextToken);
    const second = await backup.listBackupJobs(
      new ListBackupJobsCommand({
        ByBackupVaultName: vaultName,
        MaxResults: 1,
        NextToken: first.NextToken,
      }),
    );

    // Then each page contains the next filtered job and the last has no token.
    assertArrayLength(first.BackupJobs ?? [], 1);
    assertIdentical(first.BackupJobs?.[0]?.ResourceArn, firstResourceArn);
    assertArrayLength(second.BackupJobs ?? [], 1);
    assertIdentical(second.BackupJobs?.[0]?.ResourceArn, secondResourceArn);
    assertUndefined(second.NextToken);
  });

  it("refuses invalid backup job pagination", async () => {
    // Given a stored backup job.
    const simAws = new SimAws();
    const backup = simAws.backup();
    const vaultName = `vault-${faker.string.uuid()}`;
    await backup.createBackupVault(
      new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    await backup.startBackupJob(
      new StartBackupJobCommand({
        BackupVaultName: vaultName,
        ResourceArn: `arn:aws:s3:::${faker.string.uuid()}`,
        IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
      }),
    );

    // When a page size or continuation token falls outside the API contract.
    // Then AWS Backup refuses each listing.
    await expect(
      backup.listBackupJobs(new ListBackupJobsCommand({ MaxResults: 0 })),
    ).rejects.toBeInstanceOf(SimBackupInvalidParameterValueException);
    await expect(
      backup.listBackupJobs(
        new ListBackupJobsCommand({ NextToken: "not-a-token" }),
      ),
    ).rejects.toBeInstanceOf(SimBackupInvalidParameterValueException);
  });
});
