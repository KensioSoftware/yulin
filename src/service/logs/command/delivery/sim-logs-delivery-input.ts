import {
  SimLogsUnsupportedOperationException,
  SimLogsValidationException,
} from "../../error/sim-logs.error.js";

/**
 * Read a value a delivery operation requires.
 *
 * The delivery operations report a missing field as a `ValidationException`
 * rather than the `InvalidParameterException` the log group operations use,
 * which is why this exists beside the readers those share.
 */
export function requiredSimLogsDeliveryValue(
  value: string | undefined,
  field: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new SimLogsValidationException(
      `1 validation error detected: Value at '${field}' failed to satisfy ` +
        `constraint: Member must not be null`,
    );
  }

  return value;
}

/**
 * Refuse tags on a delivery resource.
 *
 * Nothing reads a tag back here, so a resource created with them would look
 * tagged to the request that made it and untagged to everything else.
 */
export function refuseUnsimulatedDeliveryTags(
  tags: Record<string, string> | undefined,
  operation: string,
): void {
  if (tags !== undefined) {
    throw new SimLogsUnsupportedOperationException(
      `Delivery resource tags are not simulated, so ${operation} refuses ` +
        `them rather than dropping them`,
    );
  }
}
