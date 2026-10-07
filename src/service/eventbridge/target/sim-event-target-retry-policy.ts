import { SimEventBridgeValidationException } from "../error/sim-event-bridge.error.js";

/**
 * The longest EventBridge keeps retrying an event, and the most retries it
 * makes, when a target's retry policy leaves either out.
 */
const defaultMaximumEventAgeInSeconds = 86_400;
const defaultMaximumRetryAttempts = 185;

const minimumEventAgeInSeconds = 60;

/**
 * A target's `RetryPolicy`, as a request or a template carries it.
 */
export interface SimEventTargetRetryPolicyInput {
  readonly MaximumEventAgeInSeconds?: number | undefined;
  readonly MaximumRetryAttempts?: number | undefined;
}

/**
 * The retry limits one target declares, and the values they come to.
 *
 * A limit the policy leaves out takes EventBridge's own default, which is 185
 * retries over at most 24 hours.
 */
export class SimEventTargetRetryPolicy {
  public readonly declared: SimEventTargetRetryPolicyInput;
  public readonly maximumEventAgeInSeconds: number;
  public readonly maximumRetryAttempts: number;

  private constructor(policy: SimEventTargetRetryPolicyInput) {
    this.declared = { ...policy };
    this.maximumEventAgeInSeconds =
      policy.MaximumEventAgeInSeconds ?? defaultMaximumEventAgeInSeconds;
    this.maximumRetryAttempts =
      policy.MaximumRetryAttempts ?? defaultMaximumRetryAttempts;
  }

  /**
   * Read the retry policy a target may leave out.
   */
  static optional(
    policy: SimEventTargetRetryPolicyInput | undefined,
  ): SimEventTargetRetryPolicy | undefined {
    if (policy === undefined) {
      return undefined;
    }

    return this.of(policy);
  }

  /**
   * Read a retry policy, refusing values outside EventBridge's ranges.
   */
  static of(policy: SimEventTargetRetryPolicyInput): SimEventTargetRetryPolicy {
    this.requireWholeNumber(
      "MaximumEventAgeInSeconds",
      policy.MaximumEventAgeInSeconds,
      minimumEventAgeInSeconds,
      defaultMaximumEventAgeInSeconds,
    );
    this.requireWholeNumber(
      "MaximumRetryAttempts",
      policy.MaximumRetryAttempts,
      0,
      defaultMaximumRetryAttempts,
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
      throw new SimEventBridgeValidationException(
        `Invalid parameter: Target RetryPolicy ${name} Reason: it is a whole ` +
          `number between ${String(minimum)} and ${String(maximum)}, and ` +
          `${String(value)} is not.`,
      );
    }
  }
}
