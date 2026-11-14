import { SimIamValidationError } from "../error/sim-iam.error.js";

/**
 * Refuse a required request member that is absent or empty, the way IAM's
 * input validation does, and answer the value.
 */
export function simIamRequired(
  value: string | undefined,
  member: string,
): string {
  if (value === undefined || value.length === 0) {
    throw new SimIamValidationError(
      `1 validation error detected: Value null at '${member}' failed to ` +
        "satisfy constraint: Member must not be null",
    );
  }

  return value;
}
