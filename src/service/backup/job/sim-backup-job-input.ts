import type {
  SimBackupLifecycle,
  SimRecoveryPointCreator,
} from "../command/sim-backup-command.types.js";
import type { SimBackupVault } from "../vault/sim-backup-vault.js";

export interface StartSimBackupJob {
  readonly vault: SimBackupVault;
  readonly resourceArn: string;
  readonly iamRoleArn: string;
  readonly at: Date;
  readonly idempotencyToken?: string | undefined;
  readonly lifecycle?: SimBackupLifecycle | undefined;
  readonly createdBy?: SimRecoveryPointCreator | undefined;
}
