import type { SimBackupLifecycle } from "../command/sim-backup-command.types.js";
import { SimBackupInvalidParameterValueException } from "../error/sim-backup.error.js";
import {
  backupVaultLockDate,
  validateBackupVaultLockConfiguration,
} from "./sim-backup-vault-lock-configuration.js";
import { backupLifecycleRefusal } from "./sim-backup-vault-retention.js";

export interface SimBackupVaultLockConfiguration {
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly ChangeableForDays?: number | undefined;
}

/** Holds the Vault Lock state for one backup vault. */
export class SimBackupVaultLock {
  public configuration?: SimBackupVaultLockConfiguration | undefined;
  public lockDate?: Date | undefined;

  constructor(private readonly vaultName: string) {}

  configure(configuration: SimBackupVaultLockConfiguration, now: Date): void {
    if (this.lockDate !== undefined && now >= this.lockDate) {
      throw new SimBackupInvalidParameterValueException(
        `The lock configuration for backup vault ${this.vaultName} is immutable`,
      );
    }
    validateBackupVaultLockConfiguration(configuration);
    this.configuration = { ...configuration };
    this.lockDate = backupVaultLockDate(configuration.ChangeableForDays, now);
  }

  lifecycleRefusal(
    lifecycle: SimBackupLifecycle | undefined,
  ): string | undefined {
    return backupLifecycleRefusal(lifecycle, this.configuration);
  }
}
