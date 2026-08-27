import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import {
  assumeSimServiceRole,
  type SimServiceRoleRefusals,
  type SimServiceRoleTarget,
  simServiceRoleTarget,
} from "../../sts/service-role/sim-service-role.js";
import { SimSchedulerDeliveryNotPermitted } from "../error/sim-scheduler-delivery.error.js";
import { simSchedulerServicePrincipal } from "./sim-scheduler-delivery.js";

/**
 * The session name AWS gives a role Scheduler assumes for an invocation.
 */
const sessionName = "EventBridgeScheduler";

export type SimSchedulerExecutionRoleTarget = SimServiceRoleTarget;

/**
 * Read the Account and name out of a schedule's execution role ARN.
 *
 * The ARN was checked for being a role ARN when the schedule was written, so
 * this is reading a known shape rather than validating an unknown one.
 */
export function schedulerExecutionRoleTarget(
  roleArn: string,
): SimSchedulerExecutionRoleTarget {
  return simServiceRoleTarget(roleArn);
}

/**
 * What Scheduler says when it could not assume a schedule's execution role.
 */
const refusals: SimServiceRoleRefusals = {
  missingRole: (target) =>
    new SimSchedulerDeliveryNotPermitted(
      `${target.roleArn} is not a simulated IAM role, so the schedule could ` +
        `not assume it to invoke its target.`,
    ),
  untrustedRole: (target, servicePrincipal) =>
    new SimSchedulerDeliveryNotPermitted(
      `The trust policy of ${target.roleArn} does not allow ` +
        `${servicePrincipal} to assume it, so the schedule could not invoke ` +
        `its target. Add it to the role's AssumeRolePolicyDocument.`,
    ),
};

/**
 * Assume a schedule's execution role, and answer with the caller it makes.
 *
 * This is the whole of what makes Scheduler's execution model different from an
 * EventBridge rule's for most target types. A rule reaches a queue, topic or
 * function as the `events.amazonaws.com` service principal and the target's own
 * resource policy decides; a schedule assumes a role, and the role's policies
 * decide.
 */
export async function assumeSchedulerExecutionRole(
  target: SimSchedulerExecutionRoleTarget,
  scope: SimAwsAccountRegionContainer,
): Promise<SimAwsCaller> {
  return await assumeSimServiceRole({
    target,
    servicePrincipal: simSchedulerServicePrincipal,
    sessionName,
    scope,
    refusals,
  });
}
