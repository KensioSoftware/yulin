import type { SimAwsPrincipal } from "../../aws/caller/sim-aws-caller.js";
import { SimIamValidationError } from "../../iam/error/sim-iam.error.js";

/**
 * The longest session a role chain can reach, in seconds.
 */
const roleChainingMaxSessionDuration = 3600;

/**
 * Refuse a session longer than the Role or the caller allows.
 *
 * The Role's `MaxSessionDuration` caps every session. A caller that is itself
 * an assumed-role session is role chaining, and AWS caps that at one hour
 * whatever the Role allows.
 */
export function assertSimStsSessionDuration(
  durationSeconds: number,
  maxSessionDuration: number,
  caller: SimAwsPrincipal,
): void {
  if (
    isAssumedRoleSession(caller) &&
    durationSeconds > roleChainingMaxSessionDuration
  ) {
    throw new SimIamValidationError(
      "The requested DurationSeconds exceeds the 1 hour session limit for " +
        "roles assumed by role chaining.",
    );
  }

  if (durationSeconds > maxSessionDuration) {
    throw new SimIamValidationError(
      "The requested DurationSeconds exceeds the MaxSessionDuration set for " +
        "this role.",
    );
  }
}

/**
 * Whether a caller is an assumed-role session.
 */
function isAssumedRoleSession(caller: SimAwsPrincipal): boolean {
  return (
    caller.kind === "arn" &&
    /^arn:[^:]+:sts::\d{12}:assumed-role\//u.test(caller.arn)
  );
}
