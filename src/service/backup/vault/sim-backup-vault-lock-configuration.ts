import { SimBackupInvalidParameterValueException } from "../error/sim-backup.error.js";
import type { SimBackupVaultLockConfiguration } from "./sim-backup-vault-lock.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/** Calculates when a Vault Lock grace period ends. */
export function backupVaultLockDate(
  changeableForDays: number | undefined,
  now: Date,
): Date | undefined {
  if (changeableForDays === undefined) {
    return undefined;
  }
  return new Date(now.getTime() + changeableForDays * millisecondsPerDay);
}

/** Validates a Vault Lock configuration before storage. */
export function validateBackupVaultLockConfiguration(
  configuration: SimBackupVaultLockConfiguration,
): void {
  const { MinRetentionDays: minimum, MaxRetentionDays: maximum } =
    configuration;
  if (
    minimum !== undefined &&
    (!Number.isSafeInteger(minimum) || minimum < 1)
  ) {
    throw new SimBackupInvalidParameterValueException(
      "MinRetentionDays must be a positive whole number",
    );
  }
  if (
    maximum !== undefined &&
    (!Number.isSafeInteger(maximum) || maximum < 1 || maximum > 36_500)
  ) {
    throw new SimBackupInvalidParameterValueException(
      "MaxRetentionDays must be between 1 and 36500",
    );
  }
  if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
    throw new SimBackupInvalidParameterValueException(
      "MinRetentionDays must not exceed MaxRetentionDays",
    );
  }
  validateGracePeriod(configuration.ChangeableForDays);
}

function validateGracePeriod(grace: number | undefined): void {
  if (
    grace !== undefined &&
    (!Number.isSafeInteger(grace) || grace < 3 || grace > 36_500)
  ) {
    throw new SimBackupInvalidParameterValueException(
      "ChangeableForDays must be between 3 and 36500",
    );
  }
}
