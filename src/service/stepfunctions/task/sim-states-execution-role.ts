import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimIam } from "../../iam/sim-iam.js";
import {
  assumeSimServiceRole,
  type SimServiceRoleRefusals,
  type SimServiceRoleTarget,
  simServiceRoleTarget,
} from "../../sts/service-role/sim-service-role.js";
import { SimStatesTaskFailure } from "../error/sim-step-functions.error.js";

/**
 * The service principal a state machine's execution role trusts.
 */
export const simStatesServicePrincipal = "states.amazonaws.com";

/**
 * The session name this gives the role an execution assumes.
 *
 * Nothing in the simulation reads it apart from the principal ARN a policy
 * condition could match on.
 */
const sessionName = "StatesExecution";

/**
 * Read the Account and name out of a state machine's `RoleArn`.
 *
 * `CreateStateMachine` takes the role ARN as it is written, so a value that is
 * not a role ARN at all is found here, at the first task that needs it.
 */
export function simStatesExecutionRoleTarget(
  roleArn: string,
  stateName: string,
): SimServiceRoleTarget {
  try {
    return simServiceRoleTarget(roleArn);
  } catch {
    throw new SimStatesTaskFailure(
      `The state machine's RoleArn is ${roleArn}, which is not an IAM role ` +
        `ARN, so the Task state ${stateName} had no role to assume.`,
    );
  }
}

/**
 * What a state machine says when it could not assume its execution role.
 */
const refusals: SimServiceRoleRefusals = {
  missingRole: (target) =>
    new SimStatesTaskFailure(
      `${target.roleArn} is not a simulated IAM role, so the execution ` +
        "could not assume it to do its task.",
    ),
  untrustedRole: (target, servicePrincipal) =>
    new SimStatesTaskFailure(
      `The trust policy of ${target.roleArn} does not allow ` +
        `${servicePrincipal} to assume it, so the execution could not do ` +
        "its task. Add it to the role's AssumeRolePolicyDocument.",
    ),
};

/**
 * Assume a state machine's execution role, and answer with the caller it
 * makes.
 *
 * A task reaches a function as a session of this role, and the role's own
 * policies decide what it may do. That is the difference from an EventBridge
 * rule, which reaches a function as a service principal and is admitted by the
 * function's resource policy.
 */
export async function assumeSimStatesExecutionRole(
  target: SimServiceRoleTarget,
  iam: SimIam,
): Promise<SimAwsCaller> {
  return await assumeSimServiceRole({
    target,
    servicePrincipal: simStatesServicePrincipal,
    sessionName,
    iam,
    refusals,
  });
}
