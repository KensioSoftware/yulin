import type { SimArn } from "../../../aws/arn.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocument,
} from "../../policy/sim-iam-policy.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimIamAllowRequirement } from "../allow/sim-iam-allow-requirement.js";

export type SimIamAuthZPolicySourceType =
  | "identity-inline"
  | "identity-managed"
  | "resource"
  | "trust"
  | "permissions-boundary"
  | "session";

export interface SimIamAuthZPolicySource {
  readonly sourceType: SimIamAuthZPolicySourceType;
  readonly document: SimIamPolicyDocument;
  readonly policyName?: string | undefined;
  readonly policyArn?: SimArn | undefined;
  readonly resourceArn?: string | undefined;
}

/**
 * A policy source that can participate as a resource or trust policy.
 */
export type SimIamAuthZResourcePolicySource = Omit<
  SimIamAuthZPolicySource,
  "sourceType"
> & {
  readonly sourceType: Extract<
    SimIamAuthZPolicySourceType,
    "resource" | "trust"
  >;
};

export interface SimIamAuthZContext {
  /**
   * Identity-based policies that grant permissions to the principal.
   *
   * This includes inline identity policies and attached managed policies.
   */
  readonly identityPolicies: readonly SimIamAuthZPolicySource[];

  /**
   * Resource-based policies owned by the target resource or service.
   *
   * Resource policies are not gathered from IAM's managed policy store.
   */
  readonly resourcePolicies: readonly SimIamAuthZPolicySource[];

  /**
   * How an Allow from each policy side combines into the final decision.
   *
   * Within one Account either side is enough. A cross-Account request needs
   * both, because each Account only speaks for its own principals and
   * resources.
   */
  readonly allowRequirement: SimIamAllowRequirement;

  readonly action: string;
  readonly resource: string;
  readonly conditionContext: Readonly<Record<string, SimIamConditionValue>>;

  /**
   * Resolved caller and any metadata derived from its principal.
   */
  readonly caller: SimAwsResolvedCaller;
}
