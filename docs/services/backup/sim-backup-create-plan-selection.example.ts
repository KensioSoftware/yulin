/**
 * Creating a daily backup plan for one DynamoDB table.
 */

import {
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  GetBackupPlanCommand,
  GetBackupSelectionCommand,
} from "@aws-sdk/client-backup";
import { assertNonNullable } from "@kensio/smartass";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const backup = simAws.backup();

await backup.createBackupVault(
  new CreateBackupVaultCommand({
    BackupVaultName: "application-backups",
  }),
);

const createdPlan = await backup.createBackupPlan(
  new CreateBackupPlanCommand({
    BackupPlan: {
      BackupPlanName: "application-plan",
      Rules: [
        {
          RuleName: "daily",
          TargetBackupVaultName: "application-backups",
          ScheduleExpression: "cron(0 1 ? * * *)",
          Lifecycle: { DeleteAfterDays: 35 },
        },
      ],
    },
  }),
);
assertNonNullable(createdPlan.BackupPlanId);

const createdSelection = await backup.createBackupSelection(
  new CreateBackupSelectionCommand({
    BackupPlanId: createdPlan.BackupPlanId,
    BackupSelection: {
      SelectionName: "orders",
      IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
      Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
    },
  }),
);
assertNonNullable(createdSelection.SelectionId);

const plan = await backup.getBackupPlan(
  new GetBackupPlanCommand({ BackupPlanId: createdPlan.BackupPlanId }),
);
console.log(plan.BackupPlan?.Rules?.[0]?.ScheduleExpression);
// "cron(0 1 ? * * *)"

const selection = await backup.getBackupSelection(
  new GetBackupSelectionCommand({
    BackupPlanId: createdPlan.BackupPlanId,
    SelectionId: createdSelection.SelectionId,
  }),
);
console.log(selection.BackupSelection?.Resources);
// ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"]
