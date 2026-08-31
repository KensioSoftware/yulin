import {
  type BackgroundScheduler,
  BackgroundTasks,
} from "../../util/background/background.js";
import type { SimSdkCommandRouter } from "../../sdk/router/sim-sdk-command-router.type.js";
import type { SimAwsAccountRegionScope } from "../aws/sim-aws-account-region-scope.js";
import { simAwsAccountRegionScopeFactory } from "../aws/sim-aws-account-region-scope.factory.js";
import { simIamInRegion } from "../iam/authorize/sim-iam-region-auth-z.js";
import { SimBackupConfigurationCommands } from "./command/sim-backup-configuration-commands.js";
import type * as commands from "./command/sim-backup-command.types.js";
import { SimBackupAuthorizer } from "./command/sim-backup-authorizer.js";
import { SimBackupJobCommands } from "./command/sim-backup-job-commands.js";
import { SimBackupRecoveryPointCommands } from "./command/sim-backup-recovery-point-commands.js";
import type { SimBackupRequestOptions } from "./command/sim-backup-request-options.js";
import type { SimBackupPlan } from "./plan/sim-backup-plan.js";
import { SimBackupPlanSchedules } from "./plan/sim-backup-plan-schedules.js";
import type { SimBackupSelection } from "./selection/sim-backup-selection.js";
import type { SimBackupProperties } from "./sim-backup-properties.js";
import { SimBackupResourceResolver } from "./sim-backup-resource-resolver.js";
import { SimBackupStore } from "./sim-backup-store.js";
import type { SimBackupVault } from "./vault/sim-backup-vault.js";
import { SimBackupJobs } from "./job/sim-backup-jobs.js";
import { SimBackupSdkCommandRouter } from "./sdk/sim-backup-sdk-command-router.js";
import { SimBackupCfnResourceFactory } from "./cfn/sim-backup-cfn-resource-factory.js";

/** Simulates AWS Backup resources in one account and Region. */
export class SimBackup {
  private readonly store = new SimBackupStore();
  private readonly scope: SimAwsAccountRegionScope;
  private readonly background: BackgroundScheduler;
  private readonly authorizer: SimBackupAuthorizer;
  private readonly resolver: SimBackupResourceResolver;
  private readonly jobs: SimBackupJobs;
  private readonly schedules: SimBackupPlanSchedules;
  private readonly jobCommands: SimBackupJobCommands;
  private readonly recoveryPointCommands: SimBackupRecoveryPointCommands;
  private readonly configurationCommands: SimBackupConfigurationCommands;
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
    this.jobs = new SimBackupJobs({ scope: this.scope, store: this.store });
    this.schedules = new SimBackupPlanSchedules({
      store: this.store,
      jobs: this.jobs,
      background: this.background,
    });
    this.jobCommands = new SimBackupJobCommands({
      background: this.background,
      authorizer: this.authorizer,
      resolver: this.resolver,
      store: this.store,
      jobs: this.jobs,
    });
    this.recoveryPointCommands = new SimBackupRecoveryPointCommands({
      background: this.background,
      authorizer: this.authorizer,
      resolver: this.resolver,
    });
    this.configurationCommands = new SimBackupConfigurationCommands({
      scope: this.scope,
      background: this.background,
      authorizer: this.authorizer,
      resolver: this.resolver,
      store: this.store,
      schedules: this.schedules,
    });
  }

  async createBackupVault(
    command: commands.SimCreateBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupVaultCommandOutput> {
    return await this.configurationCommands.createBackupVault(command, options);
  }

  async describeBackupVault(
    command: commands.SimDescribeBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDescribeBackupVaultCommandOutput> {
    return await this.configurationCommands.describeBackupVault(
      command,
      options,
    );
  }

  async deleteBackupVault(
    command: commands.SimDeleteBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDeleteBackupVaultCommandOutput> {
    return await this.configurationCommands.deleteBackupVault(command, options);
  }

  async listBackupVaults(
    _command: commands.SimListBackupVaultsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupVaultsCommandOutput> {
    return await this.configurationCommands.listBackupVaults(_command, options);
  }

  async putBackupVaultLockConfiguration(
    command: commands.SimPutBackupVaultLockConfigurationCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimPutBackupVaultLockConfigurationCommandOutput> {
    return await this.configurationCommands.putBackupVaultLockConfiguration(
      command,
      options,
    );
  }

  async createBackupPlan(
    command: commands.SimCreateBackupPlanCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupPlanCommandOutput> {
    return await this.configurationCommands.createBackupPlan(command, options);
  }

  async getBackupPlan(
    command: commands.SimGetBackupPlanCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimGetBackupPlanCommandOutput> {
    return await this.configurationCommands.getBackupPlan(command, options);
  }

  async createBackupSelection(
    command: commands.SimCreateBackupSelectionCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimCreateBackupSelectionCommandOutput> {
    return await this.configurationCommands.createBackupSelection(
      command,
      options,
    );
  }

  async getBackupSelection(
    command: commands.SimGetBackupSelectionCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimGetBackupSelectionCommandOutput> {
    return await this.configurationCommands.getBackupSelection(
      command,
      options,
    );
  }

  async listBackupSelections(
    command: commands.SimListBackupSelectionsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupSelectionsCommandOutput> {
    return await this.configurationCommands.listBackupSelections(
      command,
      options,
    );
  }

  async startBackupJob(
    command: commands.SimStartBackupJobCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimStartBackupJobCommandOutput> {
    return await this.jobCommands.start(command, options);
  }

  async describeBackupJob(
    command: commands.SimDescribeBackupJobCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDescribeBackupJobCommandOutput> {
    return await this.jobCommands.describe(command, options);
  }

  async listBackupJobs(
    command: commands.SimListBackupJobsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupJobsCommandOutput> {
    return await this.jobCommands.list(command, options);
  }

  async listRecoveryPointsByBackupVault(
    command: commands.SimListRecoveryPointsByBackupVaultCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListRecoveryPointsByBackupVaultCommandOutput> {
    return await this.recoveryPointCommands.list(command, options);
  }

  async describeRecoveryPoint(
    command: commands.SimDescribeRecoveryPointCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDescribeRecoveryPointCommandOutput> {
    return await this.recoveryPointCommands.describe(command, options);
  }

  vault(name: string): SimBackupVault {
    return this.resolver.requireVault(name);
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

  removeBackupVault(name: string): void {
    this.store.removeVault(name);
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
