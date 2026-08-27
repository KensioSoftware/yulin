import type { SimAwsAccountRegionContainer } from "../../aws/sim-aws-account-region-scope.js";
import type { AwsRegionName } from "../../aws/sim-aws-region.js";
import type { SimIamAuthorizationInput } from "./context/sim-iam-auth-z-context-builder.js";
import {
  SimIamAllowAllAuth,
  type SimIamAuthorizationDecision,
  type SimIamInterServiceAuthZ,
} from "./sim-iam-inter-service-auth-z.js";

/**
 * The Region a global service's requests are made in.
 *
 * IAM, CloudFront and Route53 each have one endpoint between all Regions, and
 * that endpoint is in us-east-1. A request to one is made in us-east-1
 * wherever the caller is. A service control policy confining an Account to a
 * list of Regions therefore has to leave the global services' actions out of
 * the condition, or it loses access to all of them.
 */
export const simIamGlobalServiceRegion: AwsRegionName = "us-east-1";

/**
 * IAM authorization for the requests one Region's services make.
 *
 * IAM belongs to an Account and is shared by every Region in it. It has no
 * Region of its own to derive `aws:RequestedRegion` from. A simulated service
 * has one. It is built for a single Account and Region, and answers only the
 * requests made to that Region. Carrying that Region into each authorization
 * request is what lets a service control policy confine an Account to a list
 * of Regions.
 *
 * A service wraps its IAM in this once, where it is wired up, and its
 * authorization call sites go on saying nothing about the Region. A request
 * that already names one keeps it, and that is how a service authorizes on
 * behalf of another Region.
 */
class SimIamRegionAuthZ implements SimIamInterServiceAuthZ {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly regionName: AwsRegionName;

  constructor(iam: SimIamInterServiceAuthZ, regionName: AwsRegionName) {
    this.iam = iam;
    this.regionName = regionName;
  }

  /**
   * Evaluate an authorization request made in this Region.
   */
  authorize(input: SimIamAuthorizationInput): SimIamAuthorizationDecision {
    return this.iam.authorize({
      ...input,
      region: input.region ?? this.regionName,
    });
  }
}

/**
 * The IAM one simulated service authorizes against, bound to its Region.
 *
 * A service is built for one Account and Region, and this is where it tells
 * IAM which. A service built without IAM (a service constructed on its own,
 * outside a simulation) gets the permissive fallback it has always had, bound
 * to the same Region.
 */
export function simIamInRegion(
  iam: SimIamInterServiceAuthZ | undefined,
  regionName: AwsRegionName,
): SimIamInterServiceAuthZ {
  return new SimIamRegionAuthZ(iam ?? new SimIamAllowAllAuth(), regionName);
}

/**
 * The IAM deciding the requests made to one Account and Region scope.
 *
 * A service reaching into another scope authorizes there. Both the IAM and
 * the Region come from the scope being reached into, wherever the request
 * came from. This is what a scheduled invocation, an event delivery and an
 * HTTP request served on a function's behalf all decide against.
 */
export function simScopeIamAuthZ(
  scope: SimAwsAccountRegionContainer,
): SimIamInterServiceAuthZ {
  return simIamInRegion(scope.iam(), scope.accountRegionScope.regionName);
}
