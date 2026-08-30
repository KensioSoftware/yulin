import { randomUUID } from "node:crypto";

import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import type * as commands from "./command/sim-backup-command.types.js";
import { SimBackupAuthorizer } from "./command/sim-backup-authorizer.js";
import type { SimBackupRequestOptions } from "./command/sim-backup-request-options.js";
import { requiredString } from "./command/sim-backup-required-string.js";
import { SimBackupPlan } from "./plan/sim-backup-plan.js";
import { SimBackupSelection } from "./selection/sim-backup-selection.js";
import { backupPlanArn, backupVaultArn } from "./sim-backup-arn.js";
import type { SimBackupProperties } from "./sim-backup-properties.js";
import { SimBackupResourceResolver } from "./sim-backup-resource-resolver.js";
import { SimBackupStore } from "./sim-backup-store.js";
import { SimBackupVault } from "./vault/sim-backup-vault.js";
import { SimBackupSdkCommandRouter } from "./sdk/sim-backup-sdk-command-router.js";
import { SimBackupCfnResourceFactory } from "./cfn/sim-backup-cfn-resource-factory.js";

/** Simulates AWS Backup resources in one account and Region. */
export class SimBackup {
  private readonly store = new SimBackupStore();
  private readonly scope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly authorizer: SimBackupAuthorizer;
  private readonly resolver: SimBackupResourceResolver;
  private readonly sdkRouter = new SimBackupSdkCommandRouter(this);
  private readonly cfnFactory = new SimBackupCfnResourceFactory({
    backup: this,
  });

  constructor(properties: SimBackupProperties = {}) {
    this.scope =
      properties.accountRegionScope ?? simAwsAccountRegionScopeFactory.make();
    this.background = properties.background ?? new BackgroundTasks();
    this.authorizer = new SimBackupAuthorizer(
      simIamInRegion(properties.iam, this.scope.regionName),
    );
    this.resolver = new SimBackupResourceResolver({
      scope: this.scope,
      authorizer: this.authorizer,
      store: this.store,
    });
  }

  async createBackupVault(
    command: commands.SimCreateBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupVaultCommandOutput> {
    await this.background.sequence();
    const name = requiredString(
      command.input.BackupVaultName,
      "BackupVaultName",
    );
    const arn = backupVaultArn(name, this.scope);
    this.authorizer.authorize("backup:CreateBackupVault", arn, options);

    const vault = new SimBackupVault({
      name,
      arn,
      creationDate: this.background.now(),
      encryptionKeyArn: command.input.EncryptionKeyArn,
      creatorRequestId: command.input.CreatorRequestId,
    });
    this.store.addVault(vault);

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
    await this.background.sequence();
    const vault = this.resolver.authorizedVault(
      "backup:DescribeBackupVault",
      command.input.BackupVaultName,
      options,
    );
    return vault.describe();
  }

  async deleteBackupVault(
    command: commands.SimDeleteBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDeleteBackupVaultCommandOutput> {
    await this.background.sequence();
    const vault = this.resolver.authorizedVault(
      "backup:DeleteBackupVault",
      command.input.BackupVaultName,
      options,
    );
    this.store.removeVault(vault.name);
    return {};
  }

  async listBackupVaults(
    _command: commands.SimListBackupVaultsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupVaultsCommandOutput> {
    await this.background.sequence();
    this.authorizer.authorize("backup:ListBackupVaults", "*", options);
    return {
      BackupVaultList: this.store
        .allVaults()
        .map((vault) => vault.listMember())
        .toArray(),
    };
  }

  async putBackupVaultLockConfiguration(
    command: commands.SimPutBackupVaultLockConfigurationCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimPutBackupVaultLockConfigurationCommandOutput> {
    await this.background.sequence();
    const vault = this.resolver.authorizedVault(
      "backup:PutBackupVaultLockConfiguration",
      command.input.BackupVaultName,
      options,
    );
    vault.configureLock(command.input, this.background.now());
    return {};
  }

  async createBackupPlan(
    command: commands.SimCreateBackupPlanCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupPlanCommandOutput> {
    await this.background.sequence();
    const id = randomUUID();
    const arn = backupPlanArn(id, this.scope);
    this.authorizer.authorize("backup:CreateBackupPlan", arn, options);
    const plan = new SimBackupPlan({
      id,
      arn,
      versionId: randomUUID(),
      creationDate: this.background.now(),
      creatorRequestId: command.input.CreatorRequestId,
      plan: command.input.BackupPlan ?? {},
    });

    for (const rule of plan.rules) {
      this.resolver.requireVault(rule.TargetBackupVaultName);
    }
    this.store.addPlan(plan);

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
    await this.background.sequence();
    const plan = this.resolver.authorizedPlan(
      "backup:GetBackupPlan",
      command.input.BackupPlanId,
      options,
    );
    return plan.describe();
  }

  async createBackupSelection(
    command: commands.SimCreateBackupSelectionCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupSelectionCommandOutput> {
    await this.background.sequence();
    const plan = this.resolver.authorizedPlan(
      "backup:CreateBackupSelection",
      command.input.BackupPlanId,
      options,
    );
    const selection = new SimBackupSelection({
      id: randomUUID(),
      planId: plan.id,
      creationDate: this.background.now(),
      creatorRequestId: command.input.CreatorRequestId,
      selection: command.input.BackupSelection ?? {},
    });

    this.store.addSelection(selection);

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
    await this.background.sequence();
    const plan = this.resolver.authorizedPlan(
      "backup:GetBackupSelection",
      command.input.BackupPlanId,
      options,
    );
    return this.resolver
      .requireSelection(plan.id, command.input.SelectionId)
      .describe();
  }

  async listBackupSelections(
    command: commands.SimListBackupSelectionsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupSelectionsCommandOutput> {
    await this.background.sequence();
    const plan = this.resolver.authorizedPlan(
      "backup:ListBackupSelections",
      command.input.BackupPlanId,
      options,
    );
    return {
      BackupSelectionsList: this.store
        .selectionsForPlan(plan.id)
        .map((selection) => selection.listMember())
        .toArray(),
    };
  }

  findBackupVault(name: string): SimBackupVault | undefined {
    return this.store.vault(name);
  }

  findBackupPlan(id: string): SimBackupPlan | undefined {
    return this.store.plan(id);
  }

  findBackupSelection(id: string): SimBackupSelection | undefined {
    return this.store.selection(id);
  }

  removeBackupPlan(id: string): void {
    this.store.removePlan(id);
  }

  removeBackupSelection(id: string): void {
    this.store.removeSelection(id);
  }

  sdkCommandRouter(): SimSdkCommandRouter {
    return this.sdkRouter;
  }

  cfnResourceFactory(): SimBackupCfnResourceFactory {
    return this.cfnFactory;
  }
}
