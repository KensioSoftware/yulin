import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { cognitoUserPoolArnPrefix } from "../../user-pool/sim-cognito-user-pool-arn.js";
import type { SimCognitoUserPoolId } from "../../user-pool/sim-cognito-user-pool-id.js";

/**
 * The resource an operation with no particular pool authorizes against.
 *
 * Real Cognito gives `CreateUserPool` and `ListUserPools` no resource-level
 * permissions, so a policy allowing either has to use a resource of `*`.
 * Authorizing against `*` here is what makes a policy naming individual pool
 * ARNs fail the same way it would on real AWS.
 */
const anyResource = "*";

interface SimCognitoAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to Cognito user pool requests.
 *
 * App clients have no ARN of their own, so operations on one authorize
 * against the ARN of the pool it belongs to. A policy granting
 * `cognito-idp:DescribeUserPoolClient` on a pool therefore reaches every
 * client in it, as it does on real AWS.
 */
export class SimCognitoAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimCognitoAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a user pool.
   *
   * The pool need not exist. Real IAM evaluates a request before the service
   * handles it, so a caller with no permission is refused whether or not the
   * pool is there, and never learns which it was.
   */
  authorizeUserPool(
    action: string,
    userPoolId: SimCognitoUserPoolId,
    caller?: SimAwsCaller,
  ): void {
    this.authorizeResource(
      action,
      cognitoUserPoolArnPrefix(this.accountRegionScope) + userPoolId,
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action that names no particular pool.
   */
  authorizeAny(action: string, caller?: SimAwsCaller): void {
    this.authorizeResource(action, anyResource, caller);
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
  ): void {
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }
  }
}
