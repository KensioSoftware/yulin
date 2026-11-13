import type { SimIamAttachedPolicy } from "../../../policy/sim-iam-managed-policy-lookup.js";

export interface SimListAttachedRolePoliciesCommandInput {
  readonly RoleName?: string | undefined;
  readonly PathPrefix?: string | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

export interface SimListAttachedRolePoliciesCommand {
  readonly input: SimListAttachedRolePoliciesCommandInput;
}

export interface SimListAttachedRolePoliciesCommandOutput {
  readonly AttachedPolicies: readonly SimIamAttachedPolicy[];
  readonly IsTruncated: boolean;
}
