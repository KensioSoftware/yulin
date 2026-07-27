import {
  SimKmsDisabledException,
  SimKmsInvalidStateException,
} from "../error/sim-kms.error.js";

/**
 * The lifecycle states a simulated KMS key can be in.
 *
 * Real KMS has more of them, covering imported material, external key stores
 * and multi-Region replication. These are the three a key reaches through the
 * operations this simulation supports.
 */
export const SimKmsKeyState = {
  Enabled: "Enabled",
  Disabled: "Disabled",
  PendingDeletion: "PendingDeletion",
} as const;

export type SimKmsKeyState =
  (typeof SimKmsKeyState)[keyof typeof SimKmsKeyState];

/**
 * The lifecycle state of one simulated KMS key, and the moves it allows.
 *
 * Kept apart from the key itself so that the key is about what it holds and
 * what it can do with it, while the rules about which transitions are legal
 * and which failure each illegal one produces live in one place.
 */
export class SimKmsKeyLifecycle {
  private readonly keyArn: string;
  private currentState: SimKmsKeyState = SimKmsKeyState.Enabled;
  private scheduledDeletionDate: Date | undefined;

  constructor(keyArn: string) {
    this.keyArn = keyArn;
  }

  /**
   * The current lifecycle state.
   */
  get state(): SimKmsKeyState {
    return this.currentState;
  }

  /**
   * Whether the key is enabled, as DescribeKey reports it.
   */
  get isEnabled(): boolean {
    return this.currentState === SimKmsKeyState.Enabled;
  }

  /**
   * When the key is due to be deleted, if deletion is scheduled.
   */
  get deletionDate(): Date | undefined {
    return this.scheduledDeletionDate;
  }

  /**
   * Enable the key, if it is not pending deletion.
   */
  enable(): void {
    this.refuseWhilePendingDeletion("enable");
    this.currentState = SimKmsKeyState.Enabled;
  }

  /**
   * Disable the key, if it is not pending deletion.
   */
  disable(): void {
    this.refuseWhilePendingDeletion("disable");
    this.currentState = SimKmsKeyState.Disabled;
  }

  /**
   * Schedule the key for deletion after a recovery window.
   *
   * Real KMS does not delete a key on request. It waits out the window, during
   * which the key is unusable but recoverable, because deleting key material
   * destroys every ciphertext ever produced under it.
   */
  scheduleDeletion(deletionDate: Date): void {
    this.currentState = SimKmsKeyState.PendingDeletion;
    this.scheduledDeletionDate = deletionDate;
  }

  /**
   * Cancel a scheduled deletion, leaving the key disabled.
   *
   * Real KMS does not restore the key to enabled: cancelling returns it to
   * Disabled, and enabling it again is a separate deliberate step.
   */
  cancelDeletion(): void {
    if (this.currentState !== SimKmsKeyState.PendingDeletion) {
      throw new SimKmsInvalidStateException(
        `Key ${this.keyArn} is not pending deletion`,
      );
    }

    this.currentState = SimKmsKeyState.Disabled;
    this.scheduledDeletionDate = undefined;
  }

  /**
   * Refuse a cryptographic operation the current state does not allow.
   *
   * The two unusable states fail differently on real KMS, and the difference
   * is worth keeping: DisabledException says to enable the key, while
   * KMSInvalidStateException says the key is on its way out.
   */
  requireUsable(): void {
    if (this.currentState === SimKmsKeyState.PendingDeletion) {
      throw new SimKmsInvalidStateException(
        `Key ${this.keyArn} is pending deletion and cannot be used`,
      );
    }

    if (this.currentState === SimKmsKeyState.Disabled) {
      throw new SimKmsDisabledException(`Key ${this.keyArn} is disabled`);
    }
  }

  private refuseWhilePendingDeletion(action: string): void {
    if (this.currentState === SimKmsKeyState.PendingDeletion) {
      throw new SimKmsInvalidStateException(
        `Key ${this.keyArn} is pending deletion and cannot be ${action}d`,
      );
    }
  }
}
