import { SimSecretsManagerInvalidParameterException } from "../error/sim-secrets-manager.error.js";

const minDays = 7;
const maxDays = 30;
const defaultDays = 30;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * The two ways a DeleteSecret request can ask for a secret to go.
 */
export interface SimSecretsManagerDeletionScheduleInput {
  readonly RecoveryWindowInDays?: number | undefined;
  readonly ForceDeleteWithoutRecovery?: boolean | undefined;
}

/**
 * How soon a DeleteSecret request wants the secret gone.
 *
 * Real Secrets Manager does not delete on request: it waits out a recovery
 * window of 7 to 30 days, defaulting to 30, during which the secret can be
 * restored and its name cannot be reused. ForceDeleteWithoutRecovery skips
 * that, and asking for both at once is a contradiction real AWS refuses.
 */
export class SimSecretsManagerDeletionSchedule {
  public readonly isImmediate: boolean;

  /**
   * The recovery window in days, or undefined when deletion is immediate.
   */
  public readonly recoveryWindowInDays: number | undefined;

  constructor(input: SimSecretsManagerDeletionScheduleInput) {
    const {
      RecoveryWindowInDays: requestedDays,
      ForceDeleteWithoutRecovery: forced,
    } = input;

    this.isImmediate = forced === true;

    if (this.isImmediate) {
      SimSecretsManagerDeletionSchedule.refuseWindowWithForce(requestedDays);
      this.recoveryWindowInDays = undefined;
      return;
    }

    this.recoveryWindowInDays =
      SimSecretsManagerDeletionSchedule.validatedDays(requestedDays);
  }

  private static refuseWindowWithForce(days: number | undefined): void {
    if (days === undefined) {
      return;
    }

    throw new SimSecretsManagerInvalidParameterException(
      "RecoveryWindowInDays cannot be used with ForceDeleteWithoutRecovery: " +
        "a forced deletion has no recovery window",
    );
  }

  private static validatedDays(days: number | undefined): number {
    if (days === undefined) {
      return defaultDays;
    }

    if (!Number.isSafeInteger(days) || days < minDays || days > maxDays) {
      throw new SimSecretsManagerInvalidParameterException(
        `RecoveryWindowInDays must be a whole number between ${String(minDays)} and ${String(maxDays)}`,
      );
    }

    return days;
  }

  /**
   * When the secret is due to be gone for good.
   *
   * An immediate deletion is due now, which is what makes the name reusable
   * straight away.
   */
  deletionDateFrom(now: Date): Date {
    if (this.recoveryWindowInDays === undefined) {
      return now;
    }

    return new Date(
      now.getTime() + this.recoveryWindowInDays * millisecondsPerDay,
    );
  }
}
