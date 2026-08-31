import type { BackgroundScheduler } from "../../../util/background/background.js";
import type { SimBackupRecoveryPoint } from "../recovery-point/sim-backup-recovery-point.js";

/** Holds the unexpired recovery points in one backup vault. */
export class SimBackupVaultRecoveryPoints {
  private readonly stored = new Map<string, SimBackupRecoveryPoint>();

  constructor(private readonly background: BackgroundScheduler) {}

  add(recoveryPoint: SimBackupRecoveryPoint): void {
    this.stored.set(recoveryPoint.arn, recoveryPoint);
  }

  all(): readonly SimBackupRecoveryPoint[] {
    this.expire();
    return this.stored.values().toArray();
  }

  find(arn: string): SimBackupRecoveryPoint | undefined {
    this.expire();
    return this.stored.get(arn);
  }

  private expire(): void {
    const now = this.background.now();
    const expired = this.stored
      .values()
      .filter((point) => point.isExpired(now))
      .map((point) => point.arn)
      .toArray();
    for (const arn of expired) {
      this.stored.delete(arn);
    }
  }
}
