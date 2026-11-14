import type { SimIamPolicyHolder } from "../policy/sim-iam-policy-holder.js";
import type { SimIamUser } from "../user/sim-iam-user.js";

/**
 * Take a copy of what a Role, User or group holds, and answer a function that
 * puts it all back.
 *
 * CloudFormation takes an entity's policies, login profile and memberships
 * off before deleting it. Where the deletion is then refused, the entity is
 * left as the Stack deployed it.
 */
export function simCfnIamHolderSnapshot(
  holder: SimIamPolicyHolder & Partial<Pick<SimIamUser, "groups">>,
): () => void {
  const inline = new Map(holder.inlinePolicies);
  const attached = new Set(holder.attachedPolicyArns);
  const groups = new Map(holder.groups);

  return () => {
    for (const [policyName, document] of inline) {
      holder.inlinePolicies.set(policyName, document);
    }

    for (const policyArn of attached) {
      holder.attachedPolicyArns.add(policyArn);
    }

    for (const [groupName, group] of groups) {
      holder.groups?.set(groupName, group);
    }
  };
}
