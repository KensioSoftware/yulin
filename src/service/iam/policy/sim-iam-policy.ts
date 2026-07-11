import type { JSONString } from "../../../util/type-guard/json.js";
import type { Brand } from "../../../util/brand.type.js";
import type { SimArn } from "../../aws/arn.js";

export type SimIamPolicyName = Brand<string, "SimIamPolicyName">;
export type SimIamPolicyId = Brand<string, "SimIamPolicyId">;

export interface SimIamPolicyDocument {
  readonly Version?: string | undefined;
  readonly Id?: string | undefined;
  readonly Statement?:
    SimIamPolicyDocumentStatement | readonly SimIamPolicyDocumentStatement[];
}

export interface SimIamPolicyDocumentStatement {
  readonly Sid?: string | undefined;
  readonly Effect: "Allow" | "Deny";
  readonly Action?: string | readonly string[] | undefined;
  readonly NotAction?: string | readonly string[] | undefined;
  readonly Resource?: string | readonly string[] | undefined;
  readonly NotResource?: string | readonly string[] | undefined;
  readonly Principal?: SimIamPolicyDocumentPrincipal | undefined;
  readonly NotPrincipal?: SimIamPolicyDocumentPrincipal | undefined;
  readonly Condition?: SimIamPolicyDocumentCondition | undefined;
}

export type SimIamPolicyDocumentPrincipal =
  | string
  | readonly string[]
  | Readonly<Record<string, string | readonly string[]>>;

export type SimIamConditionValue =
  string | number | boolean | readonly string[];

export type SimIamPolicyDocumentCondition = Readonly<
  Record<string, Readonly<Record<string, SimIamConditionValue>>>
>;

/**
 * IAM managed policy record.
 *
 * This represents customer-managed or AWS-managed IAM policy metadata and its
 * default policy document. Inline policies and resource policies are stored on
 * their owning identity/resource instead of in this global managed-policy
 * store.
 */
export interface SimIamManagedPolicy {
  readonly arn: SimArn;
  readonly policyId: SimIamPolicyId;
  readonly policyName: SimIamPolicyName;
  readonly path: string;
  readonly defaultVersionId: string;
  readonly attachmentCount: number;
  readonly permissionsBoundaryUsageCount: number;
  readonly isAttachable: boolean;
  readonly description?: string | undefined;
  readonly createDate: Date;
  readonly updateDate: Date;
  readonly policyDocument?: JSONString<SimIamPolicyDocument> | undefined;
}

/**
 * Backwards-compatible alias while the IAM command handlers are migrated.
 */
export type SimIamPolicy = SimIamManagedPolicy;
