import type {
  SimBackupVaultListMember,
  SimDescribeBackupVaultCommandOutput,
} from "../command/sim-backup-command.types.js";
import { SimBackupInvalidParameterValueException } from "../error/sim-backup.error.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

export interface SimBackupVaultLockConfiguration {
  readonly MinRetentionDays?: number | undefined;
  readonly MaxRetentionDays?: number | undefined;
  readonly ChangeableForDays?: number | undefined;
}

interface SimBackupVaultProperties {
  readonly name: string;
  readonly arn: string;
  readonly creationDate: Date;
  readonly encryptionKeyArn?: string | undefined;
  readonly creatorRequestId?: string | undefined;
}

/** Stores one simulated AWS Backup vault. */
export class SimBackupVault {
  public readonly name: string;
  public readonly arn: string;
  public readonly creationDate: Date;
  public readonly encryptionKeyArn?: string | undefined;
  public readonly creatorRequestId?: string | undefined;

  private lockConfiguration?: SimBackupVaultLockConfiguration | undefined;
  private lockDate?: Date | undefined;

  constructor(properties: SimBackupVaultProperties) {
    this.name = properties.name;
    this.arn = properties.arn;
    this.creationDate = new Date(properties.creationDate);
    this.encryptionKeyArn = properties.encryptionKeyArn;
    this.creatorRequestId = properties.creatorRequestId;
  }

  configureLock(
    configuration: SimBackupVaultLockConfiguration,
    now: Date,
  ): void {
    if (this.isComplianceLocked(now)) {
      throw new SimBackupInvalidParameterValueException(
        `The lock configuration for backup vault ${this.name} is immutable`,
      );
    }

    validateLockConfiguration(configuration);
    this.lockConfiguration = { ...configuration };
    this.lockDate = lockDate(configuration.ChangeableForDays, now);
  }

  describe(): SimDescribeBackupVaultCommandOutput {
    const configuration = this.lockConfiguration;

    return {
      BackupVaultName: this.name,
      BackupVaultArn: this.arn,
      EncryptionKeyArn: this.encryptionKeyArn,
      CreationDate: new Date(this.creationDate),
      CreatorRequestId: this.creatorRequestId,
      NumberOfRecoveryPoints: 0,
      Locked: configuration !== undefined,
      MinRetentionDays: configuration?.MinRetentionDays,
      MaxRetentionDays: configuration?.MaxRetentionDays,
      LockDate:
        this.lockDate === undefined ? undefined : new Date(this.lockDate),
    };
  }

  listMember(): SimBackupVaultListMember {
    return this.describe();
  }

  private isComplianceLocked(now: Date): boolean {
    return this.lockDate !== undefined && now >= this.lockDate;
  }
}

function lockDate(
  changeableForDays: number | undefined,
  now: Date,
): Date | undefined {
  if (changeableForDays === undefined) {
    return undefined;
  }

  return new Date(now.getTime() + changeableForDays * millisecondsPerDay);
}

function validateLockConfiguration(
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

  const grace = configuration.ChangeableForDays;

  if (
    grace !== undefined &&
    (!Number.isSafeInteger(grace) || grace < 3 || grace > 36_500)
  ) {
    throw new SimBackupInvalidParameterValueException(
      "ChangeableForDays must be between 3 and 36500",
    );
  }
}
