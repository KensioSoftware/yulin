/**
 * Advancing a compliance lock through its grace period.
 */

import {
  CreateBackupVaultCommand,
  DescribeBackupVaultCommand,
  PutBackupVaultLockConfigurationCommand,
} from "@aws-sdk/client-backup";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-30T10:00:00.000Z")),
});
const backup = simAws.backup();

await backup.createBackupVault(
  new CreateBackupVaultCommand({ BackupVaultName: "compliance-backups" }),
);

await backup.putBackupVaultLockConfiguration(
  new PutBackupVaultLockConfigurationCommand({
    BackupVaultName: "compliance-backups",
    ChangeableForDays: 3,
    MinRetentionDays: 7,
    MaxRetentionDays: 365,
  }),
);

const changeable = await backup.describeBackupVault(
  new DescribeBackupVaultCommand({
    BackupVaultName: "compliance-backups",
  }),
);
console.log(changeable.LockDate?.toISOString());
// "2026-09-02T10:00:00.000Z"

await simAws.clock().advanceBy({ days: 3 });

try {
  await backup.putBackupVaultLockConfiguration(
    new PutBackupVaultLockConfigurationCommand({
      BackupVaultName: "compliance-backups",
      MinRetentionDays: 14,
    }),
  );
} catch (error) {
  console.log(error instanceof Error ? error.name : "unknown error");
  // "InvalidParameterValueException"
}
