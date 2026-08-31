import { randomUUID } from "node:crypto";

import type { SimAwsAccountRegionScope } from "../../aws/sim-aws-account-region-scope.js";
import type { StartSimBackupJob } from "../job/sim-backup-job-input.js";
import { recoveryPointArn } from "../sim-backup-arn.js";
import { SimBackupRecoveryPoint } from "./sim-backup-recovery-point.js";

/** Creates a recovery point from a successful backup attempt. */
export class SimBackupRecoveryPointFactory {
  constructor(private readonly scope: SimAwsAccountRegionScope) {}

  make(input: StartSimBackupJob): SimBackupRecoveryPoint {
    return new SimBackupRecoveryPoint({
      arn: recoveryPointArn(randomUUID(), this.scope),
      vaultName: input.vault.name,
      vaultArn: input.vault.arn,
      resourceArn: input.resourceArn,
      iamRoleArn: input.iamRoleArn,
      creationDate: input.at,
      lifecycle: input.lifecycle,
      createdBy: input.createdBy,
      encryptionKeyArn: input.vault.encryptionKeyArn,
    });
  }
}
