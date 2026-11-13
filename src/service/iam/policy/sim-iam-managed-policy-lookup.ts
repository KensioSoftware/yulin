import type { SimArn } from "../../aws/arn.js";
import { simIamAwsManagedPolicy } from "./aws-managed/sim-iam-aws-managed-policies.js";
import type { SimIamManagedPolicy } from "./sim-iam-policy.js";

/**
 * The managed policy an ARN names: one the Account created, or one AWS
 * manages and the catalogue holds.
 */
export function simIamManagedPolicyLookup(
  policies: ReadonlyMap<SimArn, SimIamManagedPolicy>,
  arn: SimArn,
): SimIamManagedPolicy | undefined {
  return policies.get(arn) ?? simIamAwsManagedPolicy(arn);
}

/**
 * The path and name a managed policy ARN carries after `policy`.
 *
 * An attachment is held by ARN alone, and an attached ARN need not name a
 * policy the simulation holds, so listing attachments reads both from the
 * ARN. The path keeps its leading and trailing slashes, as IAM gives it.
 */
export function simIamPolicyArnPathAndName(arn: SimArn): {
  readonly path: string;
  readonly policyName: string;
} {
  const resource = arn.slice(arn.indexOf(":policy/") + ":policy".length);
  const nameStart = resource.lastIndexOf("/") + 1;

  return {
    path: resource.slice(0, nameStart),
    policyName: resource.slice(nameStart),
  };
}

/**
 * A managed policy attachment as IAM lists one.
 */
export interface SimIamAttachedPolicy {
  readonly PolicyName: string;
  readonly PolicyArn: SimArn;
}

/**
 * The attachments a Role or User holds, as ListAttachedRolePolicies and
 * ListAttachedUserPolicies answer with them.
 *
 * IAM narrows the list to policies whose path starts with the prefix, and an
 * absent prefix keeps everything.
 */
export function simIamAttachedPolicies(
  attachedPolicyArns: ReadonlySet<SimArn>,
  pathPrefix = "/",
): readonly SimIamAttachedPolicy[] {
  return [...attachedPolicyArns]
    .map((arn) => ({ arn, ...simIamPolicyArnPathAndName(arn) }))
    .filter(({ path }) => path.startsWith(pathPrefix))
    .map(({ arn, policyName }) => ({ PolicyName: policyName, PolicyArn: arn }));
}
