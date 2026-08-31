import type { SimDescribeBackupVaultCommandOutput } from "../command/sim-backup-command.types.js";
import type { SimBackupVaultLockConfiguration } from "./sim-backup-vault-lock.js";

interface SimBackupVaultDescriptionSource {
  readonly name: string;
  readonly arn: string;
  readonly creationDate: Date;
  readonly encryptionKeyArn?: string | undefined;
  readonly creatorRequestId?: string | undefined;
}

/** Builds the SDK description of one backup vault. */
export function describeBackupVault(
  vault: SimBackupVaultDescriptionSource,
  lock: SimBackupVaultLockConfiguration | undefined,
  lockDate: Date | undefined,
  recoveryPointCount: number,
): SimDescribeBackupVaultCommandOutput {
  return {
    BackupVaultName: vault.name,
    BackupVaultArn: vault.arn,
    EncryptionKeyArn: vault.encryptionKeyArn,
    CreationDate: new Date(vault.creationDate),
    CreatorRequestId: vault.creatorRequestId,
    NumberOfRecoveryPoints: recoveryPointCount,
    Locked: lock !== undefined,
    MinRetentionDays: lock?.MinRetentionDays,
    MaxRetentionDays: lock?.MaxRetentionDays,
    LockDate: lockDate === undefined ? undefined : new Date(lockDate),
  };
}
