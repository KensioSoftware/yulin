import type { SimArn } from "../../../aws/arn.js";
import { SimIamLimitExceeded } from "../../error/sim-iam.error.js";
import { simIamPolicyDocumentSize } from "../../validate/size/sim-iam-policy-document-size.js";
import {
  type SimIamPolicyHolder,
  type SimIamPolicyHolderKind,
  simIamPolicyHolderQuotas,
} from "../../policy/sim-iam-policy-holder.js";

/**
 * Refuse an inline policy that would take the holder's inline policies past
 * IAM's limit on their total size.
 *
 * The policy being replaced, if the holder carries one by that name, leaves
 * the total as the new document goes in. IAM reports the limit in bytes over
 * a count of characters with whitespace taken out, and the wording is kept.
 */
export function assertSimIamInlinePolicyQuota(
  holder: SimIamPolicyHolder,
  kind: SimIamPolicyHolderKind,
  name: string,
  policy: { readonly policyName: string; readonly document: string },
): void {
  // oxlint-disable-next-line security/detect-object-injection -- kind is one of three fixed keys.
  const limit = simIamPolicyHolderQuotas[kind].inlineCharacters;
  const others = [...holder.inlinePolicies]
    .filter(([policyName]) => policyName !== policy.policyName)
    .reduce((sum, [, document]) => sum + simIamPolicyDocumentSize(document), 0);

  if (others + simIamPolicyDocumentSize(policy.document) > limit) {
    throw new SimIamLimitExceeded(
      `Maximum policy size of ${String(limit)} bytes exceeded for ` +
        `${kind.toLowerCase()} ${name}`,
    );
  }
}

/**
 * Refuse a managed policy attachment past IAM's limit on how many one holder
 * may carry. Attaching a policy the holder already carries adds nothing.
 */
export function assertSimIamManagedPolicyQuota(
  holder: SimIamPolicyHolder,
  kind: SimIamPolicyHolderKind,
  policyArn: SimArn,
): void {
  // oxlint-disable-next-line security/detect-object-injection -- kind is one of three fixed keys.
  const limit = simIamPolicyHolderQuotas[kind].managedPolicies;

  if (
    !holder.attachedPolicyArns.has(policyArn) &&
    holder.attachedPolicyArns.size >= limit
  ) {
    throw new SimIamLimitExceeded(
      `Cannot exceed quota for PoliciesPer${kind}: ${String(limit)}`,
    );
  }
}
