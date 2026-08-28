import type { SimAwsCaller } from "../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import {
  assumeSimServiceRole,
  type SimServiceRoleRefusals,
} from "../../sts/service-role/sim-service-role.js";
import {
  type SimServiceRoleTarget,
  simServiceRoleTarget,
} from "../../sts/service-role/sim-service-role-target.js";
import type { SimServiceRoleSource } from "../../sts/service-role/sim-service-role-source.js";
import { SimEventBridgeDeliveryNotPermitted } from "../error/sim-event-bridge-delivery.error.js";
import { simEventBridgeServicePrincipal } from "./sim-event-bridge-delivery.js";

/**
 * The session name AWS gives a role a rule assumes to run a task.
 */
const sessionName = "AWSEvents";

export type SimEventBridgeTargetRole = SimServiceRoleTarget;

/**
 * Read the Account and name out of a target's role ARN.
 */
export function eventBridgeTargetRole(roleArn: string): SimServiceRoleTarget {
  return simServiceRoleTarget(roleArn);
}

/**
 * What a rule says when it could not assume its target's role.
 */
const refusals: SimServiceRoleRefusals = {
  missingRole: (target) =>
    new SimEventBridgeDeliveryNotPermitted(
      `${target.roleArn} is not a simulated IAM role, so the rule could not ` +
        `assume it to run its target's task.`,
    ),
  untrustedRole: (target, servicePrincipal) =>
    new SimEventBridgeDeliveryNotPermitted(
      `The trust policy of ${target.roleArn} does not allow ` +
        `${servicePrincipal} to assume it, so the rule could not run its ` +
        `target's task. Add it to the role's AssumeRolePolicyDocument.`,
    ),
};

/**
 * Assume a target's role, and answer with the caller it makes.
 *
 * Only an ECS target has one. A queue, topic or function is reached as the
 * `events.amazonaws.com` service principal and admitted by its own resource
 * policy, but there is no resource policy on a task definition for a rule to be
 * admitted by, so running a task is a call the rule makes as a role of the
 * account instead. Real EventBridge requires the role for that reason.
 *
 * The rule is the `aws:SourceArn` AWS documents for the trust policy condition
 * it recommends against the confused deputy problem. It is the same rule ARN a
 * queue or topic policy is conditioned on for the other target types.
 */
export async function assumeEventBridgeTargetRole(
  target: SimEventBridgeTargetRole,
  scope: SimAwsAccountRegionContainer,
  source: SimServiceRoleSource,
): Promise<SimAwsCaller> {
  return await assumeSimServiceRole({
    target,
    servicePrincipal: simEventBridgeServicePrincipal,
    sessionName,
    scope,
    source,
    refusals,
  });
}
