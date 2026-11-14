import { SimIamValidationError } from "../error/sim-iam.error.js";
import type { SimIamRole } from "./sim-iam-role.js";

/**
 * The longest session a Role allows when nothing sets it, in seconds.
 */
const defaultMaxSessionDuration = 3600;

/**
 * The longest session any Role can allow, in seconds.
 */
const maximumMaxSessionDuration = 43_200;

/**
 * The longest session STS will issue for a Role, in seconds.
 */
export function simIamRoleMaxSessionDuration(role: {
  readonly maxSessionDuration?: number | undefined;
}): number {
  return role.maxSessionDuration ?? defaultMaxSessionDuration;
}

/**
 * Refuse a `MaxSessionDuration` IAM would refuse, between one hour and twelve.
 */
export function assertSimIamMaxSessionDuration(
  value: number | undefined,
): void {
  if (value === undefined) {
    return;
  }

  if (value < defaultMaxSessionDuration) {
    throw SimIamValidationError.member(
      "maxSessionDuration",
      value,
      `have value greater than or equal to ${String(defaultMaxSessionDuration)}`,
    );
  }

  if (value > maximumMaxSessionDuration) {
    throw SimIamValidationError.member(
      "maxSessionDuration",
      value,
      `have value less than or equal to ${String(maximumMaxSessionDuration)}`,
    );
  }
}

/**
 * The `MaxSessionDuration` member IAM describes a Role with, which it gives
 * for every Role.
 */
export function simIamRoleMaxSessionDurationMember(role: SimIamRole): {
  readonly MaxSessionDuration: number;
} {
  return { MaxSessionDuration: simIamRoleMaxSessionDuration(role) };
}
