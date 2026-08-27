import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";

/**
 * What a request has to say about itself for IAM to derive its global
 * condition values.
 */
export interface SimIamDerivedConditionRequest {
  readonly caller: SimAwsResolvedCaller;
  readonly region?: AwsRegionName | undefined;
}

/**
 * The global condition values IAM works out for itself.
 *
 * These are the keys a policy can be written against without the service
 * handling the request supplying anything. They are applied over the values a
 * service does supply. A service cannot overwrite one of them.
 *
 * A key the request leaves unsaid is left out. The condition matcher counts a
 * missing key as no match, and a statement conditioned on one then matches
 * nothing.
 */
export class SimIamDerivedConditions {
  /**
   * Derive what IAM knows about this request.
   */
  of(
    request: SimIamDerivedConditionRequest,
  ): Readonly<Record<string, SimIamConditionValue>> {
    return { ...this.principalArn(request.caller), ...this.region(request) };
  }

  /**
   * AWS:PrincipalArn identifies the IAM identity whose policies apply. For
   * temporary Role credentials this is the underlying Role ARN, rather than
   * the STS assumed-role session ARN retained as the effective caller for
   * diagnostics.
   */
  private principalArn(
    caller: SimAwsResolvedCaller,
  ): Readonly<Record<string, SimIamConditionValue>> {
    const principalArn = caller.identityPolicyArn ?? caller.arn;

    if (principalArn === undefined) {
      return {};
    }

    return { "aws:PrincipalArn": principalArn };
  }

  /**
   * AWS:RequestedRegion is the Region the request was made in, which on real
   * AWS is the Region of the endpoint it was sent to. Here it is the Region of
   * the simulated service handling the request. A service in one Region's
   * scope answers only requests made to that Region.
   */
  private region(
    request: SimIamDerivedConditionRequest,
  ): Readonly<Record<string, SimIamConditionValue>> {
    if (request.region === undefined) {
      return {};
    }

    return { "aws:RequestedRegion": request.region };
  }
}
