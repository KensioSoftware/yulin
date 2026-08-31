import type { SimBackupLifecycle } from "../command/sim-backup-command.types.js";
import type { SimBackupVaultLockConfiguration } from "./sim-backup-vault-lock.js";

/** Returns the Vault Lock reason that rejects a recovery point lifecycle. */
export function backupLifecycleRefusal(
  lifecycle: SimBackupLifecycle | undefined,
  lock: SimBackupVaultLockConfiguration | undefined,
): string | undefined {
  const retention = lifecycle?.DeleteAfterDays;
  const minimum = lock?.MinRetentionDays;
  if (
    minimum !== undefined &&
    retention !== undefined &&
    retention !== -1 &&
    retention < minimum
  ) {
    return `Lifecycle retention of ${retention} days is below the vault minimum of ${minimum} days`;
  }

  const maximum = lock?.MaxRetentionDays;
  if (
    maximum === undefined ||
    (retention !== undefined && retention !== -1 && retention <= maximum)
  ) {
    return undefined;
  }
  const requested =
    retention === undefined || retention === -1
      ? "indefinite"
      : `${retention} days`;
  return `Lifecycle retention of ${requested} exceeds the vault maximum of ${maximum} days`;
}
