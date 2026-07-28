import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimAwsResolvedCaller } from "../../../aws/caller/sim-aws-caller-resolver.js";
import type { SimAwsAccountRegionScope } from "../../../aws/sim-aws-account-region-scope.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { ssmParameterArnPrefix } from "../../parameter/sim-ssm-parameter-arn.js";

/**
 * The resource an operation with no particular parameter authorizes against.
 *
 * Real Parameter Store gives DescribeParameters no resource-level
 * permissions, so a policy allowing it has to use a resource of `*`.
 * Authorizing against `*` here is what makes a policy naming individual
 * parameter ARNs fail the same way it would on real AWS.
 */
const anyResource = "*";

interface SimSsmAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
  readonly accountRegionScope: SimAwsAccountRegionScope;
}

/**
 * Applies simulated IAM authorization to SSM Parameter Store requests.
 *
 * Every operation on a parameter authorizes against that parameter's ARN,
 * which drops the leading slash from the name. A policy written against
 * `parameter//myapp/prod/db-host` therefore reaches nothing here, exactly as
 * it reaches nothing on real AWS.
 */
export class SimSsmAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;
  private readonly accountRegionScope: SimAwsAccountRegionScope;

  constructor(properties: SimSsmAuthorizerProperties) {
    this.iam = properties.iam;
    this.accountRegionScope = properties.accountRegionScope;
  }

  /**
   * Ensure the caller may perform an action on a parameter, named by the
   * resource part of its ARN.
   *
   * The parameter need not exist. Real IAM evaluates a request before the
   * service handles it, so a caller with no permission is refused whether or
   * not the parameter is there, and PutParameter authorizes against the ARN
   * the parameter is about to have.
   */
  authorizeParameterResource(
    action: string,
    resource: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(
      action,
      ssmParameterArnPrefix(this.accountRegionScope) + resource,
      caller,
    );
  }

  /**
   * Ensure the caller may perform an action on a full ARN, as a hierarchy
   * path is named.
   */
  authorizeArn(
    action: string,
    arn: string,
    caller?: SimAwsCaller,
  ): SimAwsResolvedCaller {
    return this.authorizeResource(action, arn, caller);
  }

  /**
   * Ensure the caller may perform an action that names no particular
   * parameter.
   */
  authorizeAny(action: string, caller?: SimAwsCaller): SimAwsResolvedCaller {
    return this.authorizeResource(action, anyResource, caller);
  }

  private authorizeResource(
    action: string,
    resource: string,
    caller: SimAwsCaller | undefined,
  ): SimAwsResolvedCaller {
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action,
        resource,
      });
    }

    return decision.caller;
  }
}
