import { SimIamValidationError } from "../../error/sim-iam.error.js";

const entityNamePattern = /^[\w+=,.@-]+$/u;

/**
 * Refuse a name IAM refuses for a User, a group or an instance profile:
 * longer than the entity allows, or holding a character outside letters,
 * digits and `+=,.@_-`.
 */
export function assertSimIamEntityName(
  name: string,
  member: string,
  maxLength = 128,
): void {
  if (name.length > maxLength) {
    throw SimIamValidationError.member(
      member,
      name,
      `have length less than or equal to ${String(maxLength)}`,
    );
  }

  if (!entityNamePattern.test(name)) {
    throw SimIamValidationError.member(
      member,
      name,
      String.raw`satisfy regular expression pattern: [\w+=,.@-]+`,
    );
  }
}

/**
 * Refuse a group name IAM refuses.
 */
export function assertSimIamGroupName(name: string): void {
  assertSimIamEntityName(name, "groupName");
}
