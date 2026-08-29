import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type {
  SimIamConditionValue,
  SimIamPolicyDocument,
} from "../../policy/sim-iam-policy.js";
import type { SimIamCallerConditionSource } from "./sim-iam-caller-condition-source.js";
import type { SimIamAuthZPolicySourceType } from "./sim-iam-auth-z-context.js";

export interface SimIamResourcePolicyInput {
  readonly document: SimIamPolicyDocument;
  readonly sourceType?: Extract<
    SimIamAuthZPolicySourceType,
    "resource" | "trust"
  >;
  readonly policyName?: string | undefined;
  readonly resourceArn?: string | undefined;
}

/**
 * Entry-point input for sim IAM allow/deny authorization.
 */
export interface SimIamAuthorizationInput {
  readonly action: string;
  readonly resource: string;

  /**
   * The Region the request was made in, which sim IAM derives
   * `aws:RequestedRegion` from.
   *
   * A simulated service supplies its own Region. A request reaching one
   * through its command handlers therefore carries it, with the caller saying
   * nothing. IAM itself belongs to an Account and has no Region to fall back
   * on. A request arriving without one leaves the key out of the condition
   * context, and a statement conditioned on it matches nothing.
   */
  readonly region?: AwsRegionName | undefined;

  /**
   * Condition values known by the service handling the simulated request, such
   * as S3 object tags. Sim IAM automatically supplies global condition values
   * that it can derive itself, such as AWS:PrincipalArn.
   *
   * Context-key names are matched case-insensitively by the condition matcher,
   * while string values remain case-sensitive. IAM-derived values take
   * precedence over supplied values for equivalent keys.
   */
  readonly conditionContext?:
    | Readonly<Record<string, SimIamConditionValue>>
    | undefined;

  /**
   * Condition values the service can only supply once IAM has resolved the
   * caller, such as the Account a KMS request came from.
   *
   * These are combined with the values supplied directly, and IAM-derived
   * values still take precedence over both.
   */
  readonly callerConditions?: SimIamCallerConditionSource | undefined;

  /**
   * Simulated request caller.
   *
   * If credentials are supplied, they are authenticated before policy
   * evaluation. If omitted, authorization falls back to the ambient caller of
   * the run-as block the request is inside, then to the simulation's default
   * caller, and then to the Account root.
   */
  readonly caller?: SimAwsCaller | undefined;

  /**
   * Resource policies supplied by the service that owns the target resource.
   *
   * Resource policies are not loaded from IAM's managed-policy store. They are
   * supplied by the target service, such as an S3 Bucket policy or other
   * service-level resource policy.
   */
  readonly resourcePolicies?: readonly SimIamResourcePolicyInput[] | undefined;

  /**
   * Whether the resource's own policy must allow the request.
   *
   * Off by default, which is the ordinary AWS rule: a resource with no policy
   * leaves the decision to the caller's identity policies. A service sets it
   * for a resource whose policy is mandatory and is the root of trust for
   * reaching it, which in AWS means a KMS key policy.
   */
  readonly requiresResourcePolicyAllow?: boolean | undefined;

  /**
   * Whether the service is making this request with the caller's own
   * permissions rather than with its own.
   *
   * Off by default, which is the ordinary AWS rule. Within one Account a
   * resource policy admitting the caller is enough on its own. A service sets
   * this where it reaches another service as the caller. A resource policy
   * that admits whoever the request came from then grants nothing by itself,
   * because what it admits is the service. Reading a SecureString needs
   * kms:Decrypt for that reason, even under the aws/ssm key, whose policy
   * admits the Account's principals reaching KMS through Parameter Store. A
   * resource policy naming the caller still allows the request on its own.
   */
  readonly withCallerPermissions?: boolean | undefined;
}
