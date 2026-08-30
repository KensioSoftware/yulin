import { faker } from "@faker-js/faker";
import {
  CreateBackupPlanCommand,
  CreateBackupSelectionCommand,
  CreateBackupVaultCommand,
  DescribeBackupVaultCommand,
  GetBackupSelectionCommand,
  PutBackupVaultLockConfigurationCommand,
} from "@aws-sdk/client-backup";
import { assertInstanceOf, assertThrowsErrorAsync } from "@kensio/smartass";
import { describe, expect, it } from "vitest";

import { SimFixedClock } from "../../util/clock/sim-clock.js";
import { SimAws } from "../aws/sim-aws.js";
import {
  SimBackupAlreadyExistsException,
  SimBackupInvalidParameterValueException,
  SimBackupResourceNotFoundException,
} from "./error/sim-backup.error.js";

describe("simulated AWS Backup refusals", () => {
  it("makes a compliance lock immutable after its grace period", async () => {
    // Given a compliance lock that is still inside its grace period.
    const simAws = new SimAws({
      clock: new SimFixedClock(new Date("2026-08-30T10:00:00.000Z")),
    });
    const name = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: name }),
      );
    await simAws.backup().putBackupVaultLockConfiguration(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: name,
        ChangeableForDays: 3,
        MinRetentionDays: 7,
      }),
    );
    await simAws.backup().putBackupVaultLockConfiguration(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: name,
        ChangeableForDays: 4,
        MinRetentionDays: 14,
      }),
    );

    // When its revised grace period passes and another change is attempted.
    await simAws.clock().advanceBy({ days: 4 });
    const changing = simAws.backup().putBackupVaultLockConfiguration(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: name,
        ChangeableForDays: 5,
      }),
    );

    // Then the lock is immutable and its lock date remains visible.
    await expect(changing).rejects.toBeInstanceOf(
      SimBackupInvalidParameterValueException,
    );
    const vault = await simAws
      .backup()
      .describeBackupVault(
        new DescribeBackupVaultCommand({ BackupVaultName: name }),
      );
    expect(vault.LockDate?.toISOString()).toBe("2026-09-03T10:00:00.000Z");
  });

  it.each([
    { ChangeableForDays: 2 },
    { ChangeableForDays: 36_501 },
    { MinRetentionDays: 0 },
    { MaxRetentionDays: 36_501 },
    { MinRetentionDays: 10, MaxRetentionDays: 9 },
  ])("refuses an invalid vault lock configuration", async (configuration) => {
    // Given a vault and an invalid lock configuration.
    const simAws = new SimAws();
    const name = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: name }),
      );

    // When the lock configuration is applied.
    const locking = simAws.backup().putBackupVaultLockConfiguration(
      new PutBackupVaultLockConfigurationCommand({
        BackupVaultName: name,
        ...configuration,
      }),
    );

    // Then AWS Backup rejects it.
    await expect(locking).rejects.toBeInstanceOf(
      SimBackupInvalidParameterValueException,
    );
  });

  it("refuses cold storage with less than 90 days remaining", async () => {
    // Given a vault and a rule that deletes its cold backup too soon.
    const simAws = new SimAws();
    const name = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: name }),
      );

    // When the plan is created.
    const creating = simAws.backup().createBackupPlan(
      new CreateBackupPlanCommand({
        BackupPlan: {
          BackupPlanName: `plan-${faker.string.uuid()}`,
          Rules: [
            {
              RuleName: "monthly",
              TargetBackupVaultName: name,
              Lifecycle: {
                MoveToColdStorageAfterDays: 30,
                DeleteAfterDays: 119,
              },
            },
          ],
        },
      }),
    );

    // Then the lifecycle is rejected.
    await expect(creating).rejects.toBeInstanceOf(
      SimBackupInvalidParameterValueException,
    );
  });

  it("refuses duplicate names and missing resources", async () => {
    // Given one vault and one plan.
    const simAws = new SimAws();
    const name = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: name }),
      );

    // When the vault is created twice and a plan names a missing vault.
    const duplicate = await assertThrowsErrorAsync(async () => {
      await simAws
        .backup()
        .createBackupVault(
          new CreateBackupVaultCommand({ BackupVaultName: name }),
        );
    });
    const missing = await assertThrowsErrorAsync(async () => {
      await simAws.backup().createBackupPlan(
        new CreateBackupPlanCommand({
          BackupPlan: {
            BackupPlanName: `plan-${faker.string.uuid()}`,
            Rules: [
              {
                RuleName: "daily",
                TargetBackupVaultName: "missing-vault",
              },
            ],
          },
        }),
      );
    });

    // Then each failure has the AWS service error type.
    assertInstanceOf(duplicate, SimBackupAlreadyExistsException);
    assertInstanceOf(missing, SimBackupResourceNotFoundException);
  });

  it("keeps selections inside the plan that owns them", async () => {
    // Given two plans and a selection in the first.
    const simAws = new SimAws();
    const vault = `vault-${faker.string.uuid()}`;
    await simAws
      .backup()
      .createBackupVault(
        new CreateBackupVaultCommand({ BackupVaultName: vault }),
      );
    const makePlan = async (name: string): Promise<string> => {
      const plan = await simAws.backup().createBackupPlan(
        new CreateBackupPlanCommand({
          BackupPlan: {
            BackupPlanName: name,
            Rules: [{ RuleName: "daily", TargetBackupVaultName: vault }],
          },
        }),
      );
      return String(plan.BackupPlanId);
    };
    const firstPlan = await makePlan(`plan-${faker.string.uuid()}`);
    const secondPlan = await makePlan(`plan-${faker.string.uuid()}`);
    const selection = await simAws.backup().createBackupSelection(
      new CreateBackupSelectionCommand({
        BackupPlanId: firstPlan,
        BackupSelection: {
          SelectionName: "orders",
          IamRoleArn: "arn:aws:iam::888888888888:role/BackupRole",
        },
      }),
    );

    // When the second plan asks for the first plan's selection.
    const getting = simAws.backup().getBackupSelection(
      new GetBackupSelectionCommand({
        BackupPlanId: secondPlan,
        SelectionId: selection.SelectionId,
      }),
    );

    // Then the selection is absent from that plan.
    await expect(getting).rejects.toBeInstanceOf(
      SimBackupResourceNotFoundException,
    );
  });
});
