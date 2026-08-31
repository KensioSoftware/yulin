/**
 * Creating an on-demand recovery point.
 */

import {
  CreateBackupVaultCommand,
  DescribeRecoveryPointCommand,
  StartBackupJobCommand,
} from "@aws-sdk/client-backup";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-31T12:00:00.000Z")),
});
const backup = simAws.backup();
await backup.createBackupVault(
  new CreateBackupVaultCommand({ BackupVaultName: "manual-backups" }),
);

const started = await backup.startBackupJob(
  new StartBackupJobCommand({
    BackupVaultName: "manual-backups",
    ResourceArn: "arn:aws:s3:::application-files",
    IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
    Lifecycle: { DeleteAfterDays: 14 },
  }),
);
assertNonNullable(started.RecoveryPointArn);

const point = await backup.describeRecoveryPoint(
  new DescribeRecoveryPointCommand({
    BackupVaultName: "manual-backups",
    RecoveryPointArn: started.RecoveryPointArn,
  }),
);
console.log(point.CreationDate?.toISOString());
// "2026-08-31T12:00:00.000Z"
