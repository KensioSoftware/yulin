import type {
  SimBackupVaultListMember,
  SimDescribeBackupVaultCommandOutput,
} from "../command/sim-backup-command.types.js";
import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimBackupLifecycle } from "../command/sim-backup-command.types.js";
import { SimBackupInvalidRequestException } from "../error/sim-backup.error.js";
import type { SimBackupRecoveryPoint } from "../recovery-point/sim-backup-recovery-point.js";
import { describeBackupVault } from "./sim-backup-vault-description.js";
import {
  SimBackupVaultLock,
  type SimBackupVaultLockConfiguration,
} from "./sim-backup-vault-lock.js";
import { SimBackupVaultRecoveryPoints } from "./sim-backup-vault-recovery-points.js";

export type { SimBackupVaultLockConfiguration } from "./sim-backup-vault-lock.js";

interface SimBackupVaultProperties {
  readonly name: string;
  readonly arn: string;
  readonly creationDate: Date;
  readonly encryptionKeyArn?: string | undefined;
  readonly creatorRequestId?: string | undefined;
  readonly background: BackgroundScheduler;
}

/** Stores one simulated AWS Backup vault. */
export class SimBackupVault {
  public readonly name: string;
  public readonly arn: string;
  public readonly creationDate: Date;
  public readonly encryptionKeyArn?: string | undefined;
  public readonly creatorRequestId?: string | undefined;

  private readonly lock: SimBackupVaultLock;
  private readonly points: SimBackupVaultRecoveryPoints;

  constructor(properties: SimBackupVaultProperties) {
    this.name = properties.name;
    this.arn = properties.arn;
    this.creationDate = new Date(properties.creationDate);
    this.encryptionKeyArn = properties.encryptionKeyArn;
    this.creatorRequestId = properties.creatorRequestId;
    this.lock = new SimBackupVaultLock(this.name);
    this.points = new SimBackupVaultRecoveryPoints(properties.background);
  }

  configureLock(
    configuration: SimBackupVaultLockConfiguration,
    now: Date,
  ): void {
    this.lock.configure(configuration, now);
  }

  describe(): SimDescribeBackupVaultCommandOutput {
    return describeBackupVault(
      this,
      this.lock.configuration,
      this.lock.lockDate,
      this.recoveryPoints().length,
    );
  }

  listMember(): SimBackupVaultListMember {
    return this.describe();
  }

  addRecoveryPoint(recoveryPoint: SimBackupRecoveryPoint): void {
    this.points.add(recoveryPoint);
  }

  recoveryPoints(): readonly SimBackupRecoveryPoint[] {
    return this.points.all();
  }

  recoveryPoint(arn: string): SimBackupRecoveryPoint | undefined {
    return this.points.find(arn);
  }

  assertEmpty(): void {
    if (this.recoveryPoints().length > 0) {
      throw new SimBackupInvalidRequestException(
        `Backup vault ${this.name} cannot be deleted while it contains recovery points`,
      );
    }
  }

  lifecycleRefusal(
    lifecycle: SimBackupLifecycle | undefined,
  ): string | undefined {
    return this.lock.lifecycleRefusal(lifecycle);
  }
}
