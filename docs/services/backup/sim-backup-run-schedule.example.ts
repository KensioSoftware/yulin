/**
 * Advancing a plan through its next scheduled backup.
 */

import {
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  ListBackupJobsCommand,
  ListRecoveryPointsByBackupVaultCommand,
} from "@aws-sdk/client-backup";
import { assertArrayLength, assertNonNullable } from "@kensio/smartass";

import { SimAws, SimFixedClock } from "@kensio/yulin";

const simAws = new SimAws({
  clock: new SimFixedClock(new Date("2026-08-31T09:30:00.000Z")),
});
const backup = simAws.backup();

await backup.createBackupVault(
  new CreateBackupVaultCommand({ BackupVaultName: "application-backups" }),
);
const createdPlan = await backup.createBackupPlan(
  new CreateBackupPlanCommand({
    BackupPlan: {
      BackupPlanName: "application-plan",
      Rules: [
        {
          RuleName: "hourly",
          TargetBackupVaultName: "application-backups",
          ScheduleExpression: "rate(1 hour)",
          Lifecycle: { DeleteAfterDays: 35 },
        },
      ],
    },
  }),
);
assertNonNullable(createdPlan.BackupPlanId);
await backup.createBackupSelection(
  new CreateBackupSelectionCommand({
    BackupPlanId: createdPlan.BackupPlanId,
    BackupSelection: {
      SelectionName: "orders",
      IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
      Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
    },
  }),
);

await simAws.clock().advanceBy({ hours: 1 });

const stored = backup.vault("application-backups").recoveryPoints();
assertArrayLength(stored, 1);
console.log(stored[0].creationDate.toISOString());
// "2026-08-31T10:30:00.000Z"

const points = await backup.listRecoveryPointsByBackupVault(
  new ListRecoveryPointsByBackupVaultCommand({
    BackupVaultName: "application-backups",
  }),
);
const jobs = await backup.listBackupJobs(new ListBackupJobsCommand({}));
console.log(points.RecoveryPoints?.[0]?.ResourceArn);
// "arn:aws:dynamodb:us-east-1:888888888888:table/orders"
console.log(jobs.BackupJobs?.[0]?.State); // "COMPLETED"
