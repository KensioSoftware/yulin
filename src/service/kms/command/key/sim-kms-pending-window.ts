import { SimKmsValidationException } from "../../error/sim-kms.error.js";

/**
 * The deletion recovery window real KMS allows, and the one it defaults to.
 */
const minDays = 7;
const maxDays = 30;
const defaultDays = 30;

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/**
 * The recovery window between scheduling a KMS key's deletion and it happening.
 *
 * Real KMS will not take less than seven days or more than thirty, because the
 * window is the only protection against destroying every ciphertext ever
 * produced under the key.
 */
export class SimKmsPendingWindow {
  public readonly days: number;

  constructor(days: number | undefined) {
    this.days = SimKmsPendingWindow.validated(days);
  }

  private static validated(days: number | undefined): number {
    if (days === undefined) {
      return defaultDays;
    }

    if (!Number.isSafeInteger(days) || days < minDays || days > maxDays) {
      throw new SimKmsValidationException(
        `PendingWindowInDays must be a whole number between ${String(minDays)} and ${String(maxDays)}`,
      );
    }

    return days;
  }

  /**
   * When a deletion scheduled now would fall due.
   */
  deletionDateFrom(now: Date): Date {
    return new Date(now.getTime() + this.days * millisecondsPerDay);
  }
}
