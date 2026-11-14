import { SimIamValidationError } from "../../error/sim-iam.error.js";

const groupNamePattern = /^[\w+=,.@-]+$/u;

/**
 * Refuse a group name IAM refuses: longer than 128 characters, or holding a
 * character outside letters, digits and `+=,.@_-`.
 */
export function assertSimIamGroupName(name: string): void {
  if (name.length > 128) {
    throw SimIamValidationError.member(
      "groupName",
      name,
      "have length less than or equal to 128",
    );
  }

  if (!groupNamePattern.test(name)) {
    throw SimIamValidationError.member(
      "groupName",
      name,
      String.raw`satisfy regular expression pattern: [\w+=,.@-]+`,
    );
  }
}
