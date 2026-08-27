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
  | "session"
  | "service-control";

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

/**
 * The service control policies attached at one level above the caller's
 * Account, which is the root, an organizational unit, or the Account itself.
 *
 * Each level has to allow the action on its own. A level allowing nothing
 * denies the request whatever another level allows, which is why the sources
 * stay grouped rather than being read as one list.
 */
export interface SimIamAuthZServiceControlPolicyLevel {
  readonly nodeName: string;
  readonly sources: readonly SimIamAuthZPolicySource[];
}

/**
 * The service control policies in force for an authorization request.
 *
 * `applies` is a separate fact from how many levels there are. An Account
 * inside an organization holding no policy allows nothing, while an Account
 * outside every organization is unrestricted, and both can carry no levels.
 */
export interface SimIamAuthZServiceControlPolicies {
  readonly applies: boolean;
  readonly levels: readonly SimIamAuthZServiceControlPolicyLevel[];
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

  /**
   * Service control policies in force for the caller's Account.
   *
   * These filter what the Account's principals may do and grant nothing, so
   * they are kept apart from the two sides that can allow a request.
   */
  readonly serviceControlPolicies: SimIamAuthZServiceControlPolicies;

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
