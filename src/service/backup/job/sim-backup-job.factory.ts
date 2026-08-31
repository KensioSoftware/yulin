import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { SimBackupRecoveryPoint } from "../recovery-point/sim-backup-recovery-point.js";
import { SimBackupJob } from "./sim-backup-job.js";
import type { StartSimBackupJob } from "./sim-backup-job-input.js";

/** Creates the stored record for a completed backup attempt. */
export class SimBackupJobFactory {
  constructor(private readonly scope: SimAwsAccountRegionScope) {}

  make(
    input: StartSimBackupJob,
    recoveryPoint: SimBackupRecoveryPoint | undefined,
    failure: string | undefined,
  ): SimBackupJob {
    return new SimBackupJob({
      accountId: this.scope.accountId,
      id: randomUUID(),
      vaultName: input.vault.name,
      vaultArn: input.vault.arn,
      resourceArn: input.resourceArn,
      iamRoleArn: input.iamRoleArn,
      creationDate: input.at,
      lifecycle: input.lifecycle,
      createdBy: input.createdBy,
      recoveryPointArn: recoveryPoint?.arn,
      failure,
    });
  }
}
