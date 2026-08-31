import type { BackgroundScheduler } from "../../../util/background/background.js";
import { SimBackupResourceNotFoundException } from "../error/sim-backup.error.js";
import type { SimBackupJobs } from "../job/sim-backup-jobs.js";
import { SimBackupJobPage } from "../job/sim-backup-job-page.js";
import { readBackupLifecycle } from "../plan/sim-backup-rule.js";
import type { SimBackupResourceResolver } from "../sim-backup-resource-resolver.js";
import type { SimBackupStore } from "../sim-backup-store.js";
import type { SimBackupAuthorizer } from "./sim-backup-authorizer.js";
import type * as commands from "./sim-backup-command.types.js";
import type { SimBackupRequestOptions } from "./sim-backup-request-options.js";
import { requiredString } from "./sim-backup-required-string.js";

interface SimBackupJobCommandsProperties {
  readonly background: BackgroundScheduler;
  readonly authorizer: SimBackupAuthorizer;
  readonly resolver: SimBackupResourceResolver;
  readonly store: SimBackupStore;
  readonly jobs: SimBackupJobs;
}

/** Handles backup job commands. */
export class SimBackupJobCommands {
  constructor(private readonly properties: SimBackupJobCommandsProperties) {}

  async start(
    command: commands.SimStartBackupJobCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimStartBackupJobCommandOutput> {
    const { background, resolver, jobs } = this.properties;
    await background.sequence();
    const vault = resolver.authorizedVault(
      "backup:StartBackupJob",
      command.input.BackupVaultName,
      options,
    );
    const job = jobs.start({
      vault,
      resourceArn: requiredString(command.input.ResourceArn, "ResourceArn"),
      iamRoleArn: requiredString(command.input.IamRoleArn, "IamRoleArn"),
      at: background.now(),
      idempotencyToken: command.input.IdempotencyToken,
      lifecycle: readBackupLifecycle(command.input.Lifecycle),
    });
    const output = job.describe();
    return {
      BackupJobId: job.id,
      RecoveryPointArn: output.RecoveryPointArn,
      CreationDate: output.CreationDate,
      IsParent: false,
    };
  }

  async describe(
    command: commands.SimDescribeBackupJobCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimDescribeBackupJobCommandOutput> {
    const { background, authorizer, store } = this.properties;
    await background.sequence();
    const id = requiredString(command.input.BackupJobId, "BackupJobId");
    authorizer.authorize("backup:DescribeBackupJob", "*", options);
    const job = store.job(id);
    if (job === undefined) {
      throw new SimBackupResourceNotFoundException(
        `Backup job ${id} does not exist`,
      );
    }
    return job.describe();
  }

  async list(
    command: commands.SimListBackupJobsCommand,
    options?: SimBackupRequestOptions,
  ): Promise<commands.SimListBackupJobsCommandOutput> {
    const { background, authorizer, store } = this.properties;
    await background.sequence();
    authorizer.authorize("backup:ListBackupJobs", "*", options);
    const page = new SimBackupJobPage(store.allJobs().toArray(), command.input);
    return {
      BackupJobs: page.jobs.map((job) => job.describe()),
      NextToken: page.nextToken,
    };
  }
}
