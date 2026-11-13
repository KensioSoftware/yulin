import type { SimIamAttachedPolicy } from "../../../policy/sim-iam-managed-policy-lookup.js";

export interface SimListAttachedUserPoliciesCommandInput {
  readonly UserName?: string | undefined;
  readonly PathPrefix?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

export interface SimListAttachedUserPoliciesCommand {
  readonly input: SimListAttachedUserPoliciesCommandInput;
}

export interface SimListAttachedUserPoliciesCommandOutput {
  readonly AttachedPolicies: readonly SimIamAttachedPolicy[];
  readonly IsTruncated: boolean;
}
