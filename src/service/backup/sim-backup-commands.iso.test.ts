import { faker } from "@faker-js/faker";
import {
  BackupClient,
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  DeleteBackupVaultCommand,
  DescribeBackupVaultCommand,
  GetBackupPlanCommand,
  GetBackupSelectionCommand,
  ListBackupSelectionsCommand,
  ListBackupVaultsCommand,
  PutBackupVaultLockConfigurationCommand,
  StartBackupJobCommand,
} from "@aws-sdk/client-backup";
import {
  assertArrayEmpty,
  assertArrayLength,
  assertIdentical,
  assertNonNullable,
  assertStringIncludes,
  assertTrue,
  assertUndefined,
} from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimSdk } from "../../sdk/sim-sdk.js";
import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import { SimBackupInvalidRequestException } from "./error/sim-backup.error.js";

describe("simulated AWS Backup commands", () => {
  it("stores a vault, a multi-rule plan and a resource selection", async () => {
    // Given an SDK client intercepted by a simulation at a fixed time.
    const now = new Date("2026-08-30T10:00:00.000Z");
    const simAws = new SimAws({ clock: new SimFixedClock(now) });
    using simSdk = new SimSdk({ simAws });
    const client = new BackupClient({ region: "us-east-1" });
    simSdk.intercept(client);
    const vaultName = `vault-${faker.string.uuid()}`;

    await client.send(
      new CreateBackupVaultCommand({
        BackupVaultName: vaultName,
        EncryptionKeyArn:
          "arn:aws:kms:us-east-1:888888888888:key/00000000-0000-0000-0000-000000000000",
      }),
    );
    await client.send(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: vaultName,
        MinRetentionDays: 7,
        MaxRetentionDays: 365,
      }),
    );

    // When a daily, weekly and monthly plan selects one DynamoDB table.
    const plan = await client.send(
      new CreateBackupPlanCommand({
        BackupPlan: {
          BackupPlanName: `plan-${faker.string.uuid()}`,
          Rules: [
            {
              RuleName: "daily",
              TargetBackupVaultName: vaultName,
              ScheduleExpression: "cron(0 1 ? * * *)",
              Lifecycle: { DeleteAfterDays: 35 },
            },
            {
              RuleName: "weekly",
              TargetBackupVaultName: vaultName,
              ScheduleExpression: "cron(0 2 ? * SUN *)",
              Lifecycle: { DeleteAfterDays: 90 },
            },
            {
              RuleName: "monthly",
              TargetBackupVaultName: vaultName,
              ScheduleExpression: "cron(0 3 1 * ? *)",
              Lifecycle: {
                MoveToColdStorageAfterDays: 30,
                DeleteAfterDays: 120,
              },
            },
          ],
        },
      }),
    );
    assertNonNullable(plan.BackupPlanId);
    const selected = await client.send(
      new CreateBackupSelectionCommand({
        BackupPlanId: plan.BackupPlanId,
        BackupSelection: {
          SelectionName: `selection-${faker.string.uuid()}`,
          IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
          Resources: ["arn:aws:dynamodb:us-east-1:888888888888:table/orders"],
        },
      }),
    );
    assertNonNullable(selected.SelectionId);

    // Then the SDK reads each stored resource back with its AWS-shaped values.
    const vault = await client.send(
      new DescribeBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    assertIdentical(vault.CreationDate?.toISOString(), now.toISOString());
    assertTrue(vault.Locked);
    assertIdentical(vault.MinRetentionDays, 7);
    assertUndefined(vault.LockDate);
    assertStringIncludes(
      vault.BackupVaultArn ?? "",
      `backup-vault:${vaultName}`,
    );

    const vaults = await client.send(new ListBackupVaultsCommand({}));
    assertArrayLength(vaults.BackupVaultList ?? [], 1);

    const describedPlan = await client.send(
      new GetBackupPlanCommand({ BackupPlanId: plan.BackupPlanId }),
    );
    assertArrayLength(describedPlan.BackupPlan?.Rules ?? [], 3);
    assertIdentical(
      describedPlan.BackupPlan?.Rules?.[2]?.Lifecycle?.DeleteAfterDays,
      120,
    );

    const selection = await client.send(
      new GetBackupSelectionCommand({
        BackupPlanId: plan.BackupPlanId,
        SelectionId: selected.SelectionId,
      }),
    );
    assertIdentical(
      selection.BackupSelection?.Resources?.[0],
      "arn:aws:dynamodb:us-east-1:888888888888:table/orders",
    );
    const selections = await client.send(
      new ListBackupSelectionsCommand({ BackupPlanId: plan.BackupPlanId }),
    );
    assertArrayLength(selections.BackupSelectionsList ?? [], 1);
  });

  it("keeps Backup state inside its account and region", async () => {
    // Given a vault in one account and Region.
    const simAws = new SimAws();
    const name = `vault-${faker.string.uuid()}`;
    await simAws
      .account("111111111111")
      .region("eu-west-2")
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: name }),
      );

    // When the same service is reached from each scope.
    const same = simAws.account("111111111111").region("eu-west-2").backup();
    const anotherRegion = simAws
      .account("111111111111")
      .region("us-east-1")
      .backup();
    const anotherAccount = simAws
      .account("222222222222")
      .region("eu-west-2")
      .backup();

    // Then only the original scope holds the vault.
    const sameVaults = await same.listBackupVaults(
      new ListBackupVaultsCommand({}),
    );
    const otherRegionVaults = await anotherRegion.listBackupVaults(
      new ListBackupVaultsCommand({}),
    );
    const otherAccountVaults = await anotherAccount.listBackupVaults(
      new ListBackupVaultsCommand({}),
    );
    assertArrayLength(sameVaults.BackupVaultList ?? [], 1);
    assertArrayEmpty(otherRegionVaults.BackupVaultList ?? []);
    assertArrayEmpty(otherAccountVaults.BackupVaultList ?? []);
  });

  it("deletes a vault through its SDK command", async () => {
    // Given a vault that exists.
    const simAws = new SimAws();
    const name = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: name }),
      );

    // When it is deleted.
    await simAws
      .backup()
      .deleteBackupVault(
        new DeleteBackupVaultCommand({ BackupVaultName: name }),
      );

    // Then the vault listing is empty.
    const vaults = await simAws
      .backup()
      .listBackupVaults(new ListBackupVaultsCommand({}));
    assertArrayEmpty(vaults.BackupVaultList ?? []);
  });

  it("deletes a vault only after its recovery points expire", async () => {
    // Given a vault containing a recovery point with one day of retention.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-08-31T10:00:00.000Z")),
    });
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
        Lifecycle: { DeleteAfterDays: 1 },
      }),
    );

    // When deletion is requested before and after the expiry instant.
    // Then the live point prevents deletion, while the expired point does not.
    await expect(
      backup.deleteBackupVault(
        new DeleteBackupVaultCommand({ BackupVaultName: vaultName }),
      ),
    ).rejects.toBeInstanceOf(SimBackupInvalidRequestException);
    await simAws.clock().advanceBy({ days: 1 });
    await backup.deleteBackupVault(
      new DeleteBackupVaultCommand({ BackupVaultName: vaultName }),
    );
    const vaults = await backup.listBackupVaults(
      new ListBackupVaultsCommand({}),
    );
    assertArrayEmpty(vaults.BackupVaultList ?? []);
  });

  it("stores an indefinite-retention lifecycle", async () => {
    // Given a backup vault for an indefinite-retention plan.
    const simAws = new SimAws();
    const vaultName = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: vaultName }),
      );

    // When a plan uses the paired AWS indefinite-retention values.
    const created = await simAws.backup().createBackupPlan(
      new CreateBackupPlanCommand({
        BackupPlan: {
          BackupPlanName: `plan-${faker.string.uuid()}`,
          Rules: [
            {
              RuleName: "indefinite",
              TargetBackupVaultName: vaultName,
              Lifecycle: {
                MoveToColdStorageAfterDays: -1,
                DeleteAfterDays: -1,
              },
            },
          ],
        },
      }),
    );

    // Then the plan keeps both sentinel values.
    const plan = await simAws
      .backup()
      .getBackupPlan(
        new GetBackupPlanCommand({ BackupPlanId: created.BackupPlanId }),
      );
    const lifecycle = plan.BackupPlan?.Rules?.[0]?.Lifecycle;
    assertNonNullable(lifecycle);
    assertIdentical(lifecycle.MoveToColdStorageAfterDays, -1);
    assertIdentical(lifecycle.DeleteAfterDays, -1);
  });
});
