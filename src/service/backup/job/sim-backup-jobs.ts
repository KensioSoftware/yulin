import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import { SimBackupRecoveryPointFactory } from "../recovery-point/sim-backup-recovery-point.factory.js";
import type { SimBackupStore } from "../sim-backup-store.js";
import type { SimBackupJob } from "./sim-backup-job.js";
import { SimBackupJobFactory } from "./sim-backup-job.factory.js";
import type { StartSimBackupJob } from "./sim-backup-job-input.js";

interface SimBackupJobsProperties {
  readonly scope: SimAwsAccountRegionScope;
  readonly store: SimBackupStore;
}

/** Completes backup attempts and records their jobs and recovery points. */
export class SimBackupJobs {
  private readonly store: SimBackupStore;
  private readonly pointFactory: SimBackupRecoveryPointFactory;
  private readonly jobFactory: SimBackupJobFactory;

  constructor(properties: SimBackupJobsProperties) {
    this.store = properties.store;
    this.pointFactory = new SimBackupRecoveryPointFactory(properties.scope);
    this.jobFactory = new SimBackupJobFactory(properties.scope);
  }

  start(input: StartSimBackupJob): SimBackupJob {
    const previous = this.previous(input.idempotencyToken);
    if (previous !== undefined) {
      return previous;
    }

    const failure = input.vault.lifecycleRefusal(input.lifecycle);
    const recoveryPoint =
      failure === undefined ? this.pointFactory.make(input) : undefined;

    if (recoveryPoint !== undefined) {
      input.vault.addRecoveryPoint(recoveryPoint);
    }

    const job = this.jobFactory.make(input, recoveryPoint, failure);
    this.store.addJob(job, input.idempotencyToken);
    return job;
  }

  private previous(
    idempotencyKey: string | undefined,
  ): SimBackupJob | undefined {
    if (idempotencyKey === undefined) {
      return undefined;
    }
    return this.store.jobByIdempotencyToken(idempotencyKey);
  }
}
