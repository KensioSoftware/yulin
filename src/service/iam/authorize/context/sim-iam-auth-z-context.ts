import type { SimArn } from "../../../aws/arn.js";
import type { SimAwsPrincipal } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocument,
} from "../../policy/sim-iam-policy.js";

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

  readonly action: string;
  readonly resource: string;
  readonly conditionContext: Readonly<Record<string, SimIamConditionValue>>;

  /**
   * Resolved caller principal, if the simulated request has one.
   */
  readonly callerPrincipal?: SimAwsPrincipal | undefined;
}
