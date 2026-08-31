import { SimSchedulerValidationException } from "../error/sim-scheduler.error.js";

export const defaultSchedulerMaximumEventAgeInSeconds = 86_400;
export const defaultSchedulerMaximumRetryAttempts = 185;

const minimumEventAgeInSeconds = 60;

export interface SimSchedulerRetryPolicyInput {
  readonly MaximumEventAgeInSeconds?: number | undefined;
  readonly MaximumRetryAttempts?: number | undefined;
}

/**
 * The retry limits one target declares and the effective values they produce.
 */
export class SimSchedulerRetryPolicy {
  public readonly declared: SimSchedulerRetryPolicyInput;
  public readonly maximumEventAgeInSeconds: number;
  public readonly maximumRetryAttempts: number;

  private constructor(policy: SimSchedulerRetryPolicyInput) {
    this.declared = { ...policy };
    this.maximumEventAgeInSeconds =
      policy.MaximumEventAgeInSeconds ??
      defaultSchedulerMaximumEventAgeInSeconds;
    this.maximumRetryAttempts =
      policy.MaximumRetryAttempts ?? defaultSchedulerMaximumRetryAttempts;
  }

  /**
   * Read a retry policy, refusing values outside Scheduler's limits.
   */
  static of(policy: SimSchedulerRetryPolicyInput): SimSchedulerRetryPolicy {
    this.requireWholeNumber(
      "MaximumEventAgeInSeconds",
      policy.MaximumEventAgeInSeconds,
      minimumEventAgeInSeconds,
      defaultSchedulerMaximumEventAgeInSeconds,
    );
    this.requireWholeNumber(
      "MaximumRetryAttempts",
      policy.MaximumRetryAttempts,
      0,
      defaultSchedulerMaximumRetryAttempts,
    );

    return new this(policy);
  }

  private static requireWholeNumber(
    name: string,
    value: number | undefined,
    minimum: number,
    maximum: number,
  ): void {
    if (value === undefined) {
      return;
    }

    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
      throw new SimSchedulerValidationException(
        `Target RetryPolicy ${name} must be a whole number between ` +
          `${minimum} and ${maximum}, and ${value} is not.`,
      );
    }
  }
}
