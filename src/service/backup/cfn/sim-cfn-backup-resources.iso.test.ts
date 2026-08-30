import {
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertThrowsErrorAsync,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, it } from "vitest";

import { SimAws } from "../../aws/sim-aws.js";

describe("AWS Backup CloudFormation resources", () => {
  it("deploys a vault, plan and selection into simulated AWS Backup", async () => {
    // Given a template matching the resources emitted by the CDK constructs.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "backup-stack",
      template: {
        Resources: {
          Vault: {
            Type: "AWS::Backup::BackupVault",
            Properties: {
              BackupVaultName: "governed-backups",
              EncryptionKeyArn:
                "arn:aws:kms:us-east-1:888888888888:key/00000000-0000-0000-0000-000000000000",
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
                BackupPlanName: "workload-backups",
                BackupPlanRule: [
                  {
                    RuleName: "daily",
                    TargetBackupVault: {
                      "Fn::GetAtt": ["Vault", "BackupVaultName"],
                    },
                    ScheduleExpression: "cron(0 1 ? * * *)",
                    Lifecycle: { DeleteAfterDays: 35 },
                  },
                  {
                    RuleName: "monthly",
                    TargetBackupVault: { Ref: "Vault" },
                    ScheduleExpression: "cron(0 3 1 * ? *)",
                    Lifecycle: {
                      MoveToColdStorageAfterDays: 30,
                      DeleteAfterDays: 120,
                    },
                  },
                ],
              },
            },
          },
          Selection: {
            Type: "AWS::Backup::BackupSelection",
            Properties: {
              BackupPlanId: { "Fn::GetAtt": ["Plan", "BackupPlanId"] },
              BackupSelection: {
                SelectionName: "orders",
                IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
                Resources: [
                  "arn:aws:dynamodb:us-east-1:888888888888:table/orders",
                ],
              },
            },
          },
        },
        Outputs: {
          VaultName: { Value: { Ref: "Vault" } },
          VaultArn: { Value: { "Fn::GetAtt": ["Vault", "BackupVaultArn"] } },
          PlanId: { Value: { Ref: "Plan" } },
          PlanArn: { Value: { "Fn::GetAtt": ["Plan", "BackupPlanArn"] } },
          VersionId: { Value: { "Fn::GetAtt": ["Plan", "VersionId"] } },
          SelectionId: { Value: { Ref: "Selection" } },
          SelectionAlias: { Value: { "Fn::GetAtt": ["Selection", "Id"] } },
          SelectionPlan: {
            Value: { "Fn::GetAtt": ["Selection", "BackupPlanId"] },
          },
        },
      },
    });

    // When deployment completes.
    await stack.waitForDeployComplete();

    // Then all three resources can be read from AWS Backup.
    const vault = simAws.backup().findBackupVault("governed-backups");
    assertNonNullable(vault);
    assertTrue(vault.describe().Locked);

    const planId = stack.output("PlanId");
    const plan = simAws.backup().findBackupPlan(planId);
    assertNonNullable(plan);
    assertArrayLength(plan.rules, 2);
    assertIdentical(plan.rules[1].Lifecycle?.MoveToColdStorageAfterDays, 30);

    const selectionId = stack.output("SelectionId");
    const selection = simAws.backup().findBackupSelection(selectionId);
    assertNonNullable(selection);
    assertIdentical(
      selection.resources[0],
      "arn:aws:dynamodb:us-east-1:888888888888:table/orders",
    );
    assertIdentical(stack.output("VaultName"), "governed-backups");
    assertIdentical(stack.output("SelectionAlias"), selectionId);
    assertIdentical(stack.output("SelectionPlan"), planId);
    assertIdentical(stack.output("VersionId"), plan.versionId);
  });

  it("removes the Backup resources during stack teardown", async () => {
    // Given a deployed vault, plan and selection.
    const simAws = new SimAws();
    const stack = await simAws.cloudFormation().deployTemplate({
      stackName: "backup-stack",
      template: {
        Resources: {
          Vault: {
            Type: "AWS::Backup::BackupVault",
            Properties: { BackupVaultName: "ephemeral-backups" },
          },
          Plan: {
            Type: "AWS::Backup::BackupPlan",
            Properties: {
              BackupPlan: {
                BackupPlanName: "ephemeral-plan",
                BackupPlanRule: [
                  {
                    RuleName: "daily",
                    TargetBackupVault: { Ref: "Vault" },
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
              },
            },
          },
        },
        Outputs: {
          PlanId: { Value: { Ref: "Plan" } },
          SelectionId: { Value: { Ref: "Selection" } },
        },
      },
    });
    await stack.waitForDeployComplete();
    const planId = stack.output("PlanId");
    const selectionId = stack.output("SelectionId");

    // When the stack is torn down.
    await stack.teardown();
    await simAws.backgroundTasksComplete();

    // Then none of the three resources remains.
    assertUndefined(simAws.backup().findBackupVault("ephemeral-backups"));
    assertUndefined(simAws.backup().findBackupPlan(planId));
    assertUndefined(simAws.backup().findBackupSelection(selectionId));
  });

  it("leaves no vault behind when its lock configuration fails", async () => {
    // Given a vault Resource with a lock configuration AWS Backup refuses.
    const simAws = new SimAws();

    // When the template is deployed, then the deployment fails.
    const error = await assertThrowsErrorAsync(async () => {
      await simAws.cloudFormation().deployTemplate({
        stackName: "invalid-backup-stack",
        template: {
          Resources: {
            Vault: {
              Type: "AWS::Backup::BackupVault",
              Properties: {
                BackupVaultName: "invalid-backups",
                LockConfiguration: {
                  MinRetentionDays: 30,
                  MaxRetentionDays: 7,
                },
              },
            },
          },
        },
      });
    });

    // Then the failed Resource leaves no vault to block another deployment.
    assertStringIncludes(error.message, "MinRetentionDays must not exceed");
    assertUndefined(simAws.backup().findBackupVault("invalid-backups"));

    await simAws.backgroundTasksComplete();
  });
});
