import { randomUUID } from "node:crypto";

import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimBackupPlan } from "../plan/sim-backup-plan.js";
import type { SimBackupPlanSchedules } from "../plan/sim-backup-plan-schedules.js";
import { SimBackupSelection } from "../selection/sim-backup-selection.js";
import { backupPlanArn, backupVaultArn } from "../sim-backup-arn.js";
import type { SimBackupResourceResolver } from "../sim-backup-resource-resolver.js";
import type { SimBackupStore } from "../sim-backup-store.js";
import { SimBackupVault } from "../vault/sim-backup-vault.js";
import type { SimBackupAuthorizer } from "./sim-backup-authorizer.js";
import type * as commands from "./sim-backup-command.types.js";
import type { SimBackupRequestOptions } from "./sim-backup-request-options.js";
import { requiredString } from "./sim-backup-required-string.js";

interface SimBackupConfigurationCommandsProperties {
  readonly scope: SimAwsAccountRegionScope;
  readonly background: BackgroundScheduler;
  readonly authorizer: SimBackupAuthorizer;
  readonly resolver: SimBackupResourceResolver;
  readonly store: SimBackupStore;
  readonly schedules: SimBackupPlanSchedules;
}

/** Handles backup vault, plan and selection commands. */
export class SimBackupConfigurationCommands {
  constructor(
    private readonly properties: SimBackupConfigurationCommandsProperties,
  ) {}

  async createBackupVault(
    command: commands.SimCreateBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupVaultCommandOutput> {
    const { background, scope, authorizer, store } = this.properties;
    await background.sequence();
    const name = requiredString(
      command.input.BackupVaultName,
      "BackupVaultName",
    );
    const arn = backupVaultArn(name, scope);
    authorizer.authorize("backup:CreateBackupVault", arn, options);
    const vault = new SimBackupVault({
      name,
      arn,
      creationDate: background.now(),
      encryptionKeyArn: command.input.EncryptionKeyArn,
      creatorRequestId: command.input.CreatorRequestId,
      background,
    });
    store.addVault(vault);
    return {
      BackupVaultName: vault.name,
      BackupVaultArn: vault.arn,
      CreationDate: new Date(vault.creationDate),
    };
  }

  async describeBackupVault(
    command: commands.SimDescribeBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDescribeBackupVaultCommandOutput> {
    const { background, resolver } = this.properties;
    await background.sequence();
    return resolver
      .authorizedVault(
        "backup:DescribeBackupVault",
        command.input.BackupVaultName,
        options,
      )
      .describe();
  }

  async deleteBackupVault(
    command: commands.SimDeleteBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDeleteBackupVaultCommandOutput> {
    const { background, resolver, store } = this.properties;
    await background.sequence();
    const vault = resolver.authorizedVault(
      "backup:DeleteBackupVault",
      command.input.BackupVaultName,
      options,
    );
    store.removeVault(vault.name);
    return {};
  }

  async listBackupVaults(
    _command: commands.SimListBackupVaultsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupVaultsCommandOutput> {
    const { background, authorizer, store } = this.properties;
    await background.sequence();
    authorizer.authorize("backup:ListBackupVaults", "*", options);
    return {
      BackupVaultList: store
        .allVaults()
        .map((vault) => vault.listMember())
        .toArray(),
    };
  }

  async putBackupVaultLockConfiguration(
    command: commands.SimPutBackupVaultLockConfigurationCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimPutBackupVaultLockConfigurationCommandOutput> {
    const { background, resolver } = this.properties;
    await background.sequence();
    resolver
      .authorizedVault(
        "backup:PutBackupVaultLockConfiguration",
        command.input.BackupVaultName,
        options,
      )
      .configureLock(command.input, background.now());
    return {};
  }

  async createBackupPlan(
    command: commands.SimCreateBackupPlanCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupPlanCommandOutput> {
    const { background, scope, authorizer, resolver, store, schedules } =
      this.properties;
    await background.sequence();
    const id = randomUUID();
    const arn = backupPlanArn(id, scope);
    authorizer.authorize("backup:CreateBackupPlan", arn, options);
    const plan = new SimBackupPlan({
      id,
      arn,
      versionId: randomUUID(),
      creationDate: background.now(),
      creatorRequestId: command.input.CreatorRequestId,
      plan: command.input.BackupPlan ?? {},
    });
    for (const rule of plan.rules) {
      resolver.requireVault(rule.TargetBackupVaultName);
    }
    store.addPlan(plan);
    schedules.arm(plan);
    return {
      BackupPlanId: plan.id,
      BackupPlanArn: plan.arn,
      VersionId: plan.versionId,
      CreationDate: new Date(plan.creationDate),
    };
  }

  async getBackupPlan(
    command: commands.SimGetBackupPlanCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimGetBackupPlanCommandOutput> {
    const { background, resolver } = this.properties;
    await background.sequence();
    return resolver
      .authorizedPlan(
        "backup:GetBackupPlan",
        command.input.BackupPlanId,
        options,
      )
      .describe();
  }

  async createBackupSelection(
    command: commands.SimCreateBackupSelectionCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupSelectionCommandOutput> {
    const { background, resolver, store } = this.properties;
    await background.sequence();
    const plan = resolver.authorizedPlan(
      "backup:CreateBackupSelection",
      command.input.BackupPlanId,
      options,
    );
    const selection = new SimBackupSelection({
      id: randomUUID(),
      planId: plan.id,
      creationDate: background.now(),
      creatorRequestId: command.input.CreatorRequestId,
      selection: command.input.BackupSelection ?? {},
    });
    store.addSelection(selection);
    return {
      SelectionId: selection.id,
      BackupPlanId: plan.id,
      CreationDate: new Date(selection.creationDate),
    };
  }

  async getBackupSelection(
    command: commands.SimGetBackupSelectionCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimGetBackupSelectionCommandOutput> {
    const { background, resolver } = this.properties;
    await background.sequence();
    const plan = resolver.authorizedPlan(
      "backup:GetBackupSelection",
      command.input.BackupPlanId,
      options,
    );
    return resolver
      .requireSelection(plan.id, command.input.SelectionId)
      .describe();
  }

  async listBackupSelections(
    command: commands.SimListBackupSelectionsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupSelectionsCommandOutput> {
    const { background, resolver, store } = this.properties;
    await background.sequence();
    const plan = resolver.authorizedPlan(
      "backup:ListBackupSelections",
      command.input.BackupPlanId,
      options,
    );
    return {
      BackupSelectionsList: store
        .selectionsForPlan(plan.id)
        .map((selection) => selection.listMember())
        .toArray(),
    };
  }
}
