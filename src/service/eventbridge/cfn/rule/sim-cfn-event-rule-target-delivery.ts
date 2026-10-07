import { isRecord } from "../../../../util/type-guard/record.js";
import type { SimEventTargetDeadLetterConfigInput } from "../../target/sim-event-target-dead-letter-config.js";
import type { SimEventTargetRetryPolicyInput } from "../../target/sim-event-target-retry-policy.js";

/**
 * What a rule's target says about retrying a failed delivery, and where an
 * undelivered event goes.
 */
interface SimCfnEventRuleTargetDelivery {
  readonly DeadLetterConfig: SimEventTargetDeadLetterConfigInput | undefined;
  readonly RetryPolicy: SimEventTargetRetryPolicyInput | undefined;
}

/**
 * Read a target's `DeadLetterConfig` and `RetryPolicy` from a template.
 */
export function simCfnEventRuleTargetDelivery(
  target: Record<string, unknown>,
  refuse: (reason: string) => Error,
): SimCfnEventRuleTargetDelivery {
  return {
    DeadLetterConfig: readDeadLetterConfig(target["DeadLetterConfig"], refuse),
    RetryPolicy: readRetryPolicy(target["RetryPolicy"], refuse),
  };
}

/**
 * Read a target's `DeadLetterConfig`, whose `Arn` is a queue ARN.
 *
 * Whether the ARN names a standard queue is left to PutTargets, so a template
 * and an SDK caller are refused the same way.
 */
function readDeadLetterConfig(
  config: unknown,
  refuse: (reason: string) => Error,
): SimEventTargetDeadLetterConfigInput | undefined {
  if (config === undefined) {
    return undefined;
  }

  if (!isRecord(config) || typeof config["Arn"] !== "string") {
    throw refuse("DeadLetterConfig needs an Arn");
  }

  return { Arn: config["Arn"] };
}

/**
 * Read a target's `RetryPolicy`, whose two limits are numbers.
 *
 * Their ranges are left to PutTargets, so a template and an SDK caller are
 * refused the same way.
 */
function readRetryPolicy(
  policy: unknown,
  refuse: (reason: string) => Error,
): SimEventTargetRetryPolicyInput | undefined {
  if (policy === undefined) {
    return undefined;
  }

  if (!isRecord(policy)) {
    throw refuse("RetryPolicy is an object");
  }

  return {
    MaximumEventAgeInSeconds: readLimit(
      policy,
      "MaximumEventAgeInSeconds",
      refuse,
    ),
    MaximumRetryAttempts: readLimit(policy, "MaximumRetryAttempts", refuse),
  };
}

/**
 * Read one numeric limit of a retry policy, which may be left out.
 */
function readLimit(
  policy: Record<string, unknown>,
  name: string,
  refuse: (reason: string) => Error,
): number | undefined {
  const value = new Map(Object.entries(policy)).get(name);

  if (value === undefined || typeof value === "number") {
    return value;
  }

  throw refuse(`RetryPolicy ${name} must be a number`);
}
