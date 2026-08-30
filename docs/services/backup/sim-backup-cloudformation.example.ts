/**
 * Deploying a vault, plan and selection from one template.
 */

import { GetBackupSelectionCommand } from "@aws-sdk/client-backup";

import { SimAws } from "@kensio/yulin";

const simAws = new SimAws();
const stack = await simAws.cloudFormation().deployTemplate({
  stackName: "backup-stack",
  template: {
    Resources: {
      Vault: {
        Type: "AWS::Backup::BackupVault",
        Properties: {
          BackupVaultName: "application-backups",
          LockConfiguration: {
            MinRetentionDays: 7,
            MaxRetentionDays: 365,
          },
        },
      },
      Plan: {
        Type: "AWS::Backup::BackupPlan",
        Properties: {
          BackupPlan: {
            BackupPlanName: "application-plan",
            BackupPlanRule: [
              {
                RuleName: "daily",
                TargetBackupVault: { Ref: "Vault" },
                ScheduleExpression: "cron(0 1 ? * * *)",
                Lifecycle: { DeleteAfterDays: 35 },
              },
            ],
          },
        },
      },
      Selection: {
        Type: "AWS::Backup::BackupSelection",
        Properties: {
          BackupPlanId: { Ref: "Plan" },
          BackupSelection: {
            SelectionName: "orders",
            IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
            Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
          },
        },
      },
    },
    Outputs: {
      VaultArn: {
        Value: { "Fn::GetAtt": ["Vault", "BackupVaultArn"] },
      },
      PlanId: { Value: { Ref: "Plan" } },
      SelectionId: { Value: { Ref: "Selection" } },
    },
  },
});

await stack.waitForDeployComplete();

const selection = await simAws.backup().getBackupSelection(
  new GetBackupSelectionCommand({
    BackupPlanId: stack.output("PlanId"),
    SelectionId: stack.output("SelectionId"),
  }),
);

console.log(stack.output("VaultArn"));
// "arn:aws:backup:us-east-1:888888888888:backup-vault:application-backups"
console.log(selection.BackupSelection?.SelectionName); // "orders"
