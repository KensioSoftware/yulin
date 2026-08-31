import type {
  SimBackupLifecycle,
  SimRecoveryPointCreator,
  SimRecoveryPointOutput,
} from "../command/sim-backup-command.types.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

interface SimBackupRecoveryPointProperties {
  readonly arn: string;
  readonly vaultName: string;
  readonly vaultArn: string;
  readonly resourceArn: string;
  readonly iamRoleArn: string;
  readonly creationDate: Date;
  readonly lifecycle?: SimBackupLifecycle | undefined;
  readonly createdBy?: SimRecoveryPointCreator | undefined;
  readonly encryptionKeyArn?: string | undefined;
}

/** A completed recovery point stored in a simulated backup vault. */
export class SimBackupRecoveryPoint {
  public readonly arn: string;
  public readonly vaultName: string;
  public readonly vaultArn: string;
  public readonly resourceArn: string;
  public readonly iamRoleArn: string;
  public readonly creationDate: Date;
  public readonly lifecycle?: SimBackupLifecycle | undefined;
  public readonly createdBy?: SimRecoveryPointCreator | undefined;
  public readonly encryptionKeyArn?: string | undefined;

  constructor(properties: SimBackupRecoveryPointProperties) {
    this.arn = properties.arn;
    this.vaultName = properties.vaultName;
    this.vaultArn = properties.vaultArn;
    this.resourceArn = properties.resourceArn;
    this.iamRoleArn = properties.iamRoleArn;
    this.creationDate = new Date(properties.creationDate);
    this.lifecycle =
      properties.lifecycle === undefined
        ? undefined
        : { ...properties.lifecycle };
    this.createdBy =
      properties.createdBy === undefined
        ? undefined
        : { ...properties.createdBy };
    this.encryptionKeyArn = properties.encryptionKeyArn;
  }

  isExpired(now: Date): boolean {
    const deleteAt = lifecycleDate(
      this.creationDate,
      this.lifecycle?.DeleteAfterDays,
    );
    return deleteAt !== undefined && now >= deleteAt;
  }

  describe(): SimRecoveryPointOutput {
    return {
      RecoveryPointArn: this.arn,
      BackupVaultName: this.vaultName,
      BackupVaultArn: this.vaultArn,
      ResourceArn: this.resourceArn,
      CreatedBy:
        this.createdBy === undefined ? undefined : { ...this.createdBy },
      IamRoleArn: this.iamRoleArn,
      Status: "COMPLETED",
      CreationDate: new Date(this.creationDate),
      InitiationDate: new Date(this.creationDate),
      CompletionDate: new Date(this.creationDate),
      CalculatedLifecycle: {
        MoveToColdStorageAt: lifecycleDate(
          this.creationDate,
          this.lifecycle?.MoveToColdStorageAfterDays,
        ),
        DeleteAt: lifecycleDate(
          this.creationDate,
          this.lifecycle?.DeleteAfterDays,
        ),
      },
      Lifecycle:
        this.lifecycle === undefined ? undefined : { ...this.lifecycle },
      EncryptionKeyArn: this.encryptionKeyArn,
      IsEncrypted: true,
      VaultType: "BACKUP_VAULT",
    };
  }
}

function lifecycleDate(
  createdAt: Date,
  days: number | undefined,
): Date | undefined {
  if (days === undefined || days === -1) {
    return undefined;
  }
  return new Date(createdAt.getTime() + days * millisecondsPerDay);
}
