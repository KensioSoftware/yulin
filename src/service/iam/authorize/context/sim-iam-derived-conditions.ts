import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { AwsRegionName } from "../../../aws/sim-aws-region.js";
import type { SimIamConditionValue } from "../../policy/sim-iam-policy.js";
import {
  type SimClock,
  SimRealClock,
} from "../../../../util/clock/sim-clock.js";

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
   * The simulation's clock, which the request time is read from.
   */
  private readonly clock: SimClock;

  constructor(clock: SimClock = new SimRealClock()) {
    this.clock = clock;
  }

  /**
   * Derive what IAM knows about this request.
   */
  of(
    request: SimIamDerivedConditionRequest,
  ): Readonly<Record<string, SimIamConditionValue>> {
    return {
      ...this.principalArn(request.caller),
      ...this.region(request),
      ...this.time(),
    };
  }

  /**
   * The time of the request, read from the simulated clock. A test that
   * advances the clock past a date in a policy sees the policy change its
   * answer.
   *
   * AWS writes `aws:CurrentTime` as ISO 8601 to the second and
   * `aws:EpochTime` as whole epoch seconds.
   */
  private time(): Readonly<Record<string, SimIamConditionValue>> {
    const now = this.clock.now();
    const epochSeconds = Math.floor(now.getTime() / 1000);

    return {
      "aws:CurrentTime": new Date(epochSeconds * 1000)
        .toISOString()
        .replace(".000Z", "Z"),
      "aws:EpochTime": String(epochSeconds),
    };
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
