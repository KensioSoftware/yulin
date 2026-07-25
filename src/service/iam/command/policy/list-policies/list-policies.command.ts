import type { SimArn } from "../../../../aws/arn.js";

export type SimIamPolicyScopeType = "All" | "AWS" | "Local";
export type SimIamPolicyUsageType = "PermissionsPolicy" | "PermissionsBoundary";

export interface SimListPoliciesCommandInput {
  readonly Scope?: SimIamPolicyScopeType | undefined;
  readonly OnlyAttached?: boolean | undefined;
  readonly PathPrefix?: string | undefined;
  readonly PolicyUsageFilter?: SimIamPolicyUsageType | undefined;
  readonly Marker?: string | undefined;
  readonly MaxItems?: number | undefined;
}

export interface SimListPoliciesCommand {
  readonly input: SimListPoliciesCommandInput;
}

export interface SimListPoliciesCommandOutput {
  readonly Policies: {
    readonly PolicyName: string;
    readonly PolicyId: string;
    readonly Arn: SimArn;
    readonly Path: string;
    readonly DefaultVersionId: string;
    readonly AttachmentCount: number;
    readonly PermissionsBoundaryUsageCount: number;
    readonly IsAttachable: boolean;
    readonly Description?: string | undefined;
    readonly CreateDate: Date;
    readonly UpdateDate: Date;
  }[];
  readonly IsTruncated?: boolean;
  readonly Marker?: string | undefined;
}
