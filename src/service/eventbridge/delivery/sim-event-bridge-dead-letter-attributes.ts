import {
  SimEventBridgeDeliveryNotPermitted,
  SimEventBridgeTargetNotFound,
} from "../error/sim-event-bridge-delivery.error.js";
import type { SimEventBridgeDeadLetterRequest } from "./sim-event-bridge-delivery.js";
import type { SimEventBridgeStringAttribute } from "./sim-event-bridge-queue-message.js";

/**
 * The `ERROR_CODE` a dead letter carries for a failure.
 *
 * EventBridge documents a list of codes without saying which failure gets
 * which. A target that refuses EventBridge is `NO_PERMISSIONS`, a target that
 * is not there is `NO_RESOURCE`, and anything else the target answered with
 * is `ERROR_FROM_TARGET`.
 */
function errorCode(error: unknown): string {
  if (error instanceof SimEventBridgeDeliveryNotPermitted) {
    return "NO_PERMISSIONS";
  }

  if (error instanceof SimEventBridgeTargetNotFound) {
    return "NO_RESOURCE";
  }

  return "ERROR_FROM_TARGET";
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

/**
 * The message attributes EventBridge documents for a dead letter.
 *
 * `EXHAUSTED_RETRY_CONDITION` is there only for a failure that was retried
 * until a limit ran out.
 */
export function simEventBridgeDeadLetterAttributes(
  request: SimEventBridgeDeadLetterRequest,
): Readonly<Record<string, SimEventBridgeStringAttribute>> {
  const { delivery, error, retryAttempts, exhaustedCondition } = request;
  const attributes = {
    RULE_ARN: delivery.ruleArn,
    TARGET_ARN: delivery.target.arn.value,
    ERROR_CODE: errorCode(error),
    ERROR_MESSAGE: errorMessage(error),
    RETRY_ATTEMPTS: String(retryAttempts),
    ...(exhaustedCondition !== undefined && {
      EXHAUSTED_RETRY_CONDITION: exhaustedCondition,
    }),
  };

  return Object.fromEntries(
    Object.entries(attributes).map(([name, value]) => [
      name,
      { DataType: "String", StringValue: value },
    ]),
  );
}
