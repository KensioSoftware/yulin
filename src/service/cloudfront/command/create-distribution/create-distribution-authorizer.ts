import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface CreateDistributionAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a CloudFront CreateDistribution request.
 *
 * CloudFront does not support resource-level permissions for this action, and
 * a Distribution ARN cannot exist until the request succeeds. Consequently,
 * authorization is evaluated against the IAM wildcard resource.
 */
export class CreateDistributionAuthorizer {
  private static readonly action = "cloudfront:CreateDistribution";
  private static readonly resource = "*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: CreateDistributionAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may create a CloudFront Distribution.
   *
   * Pass the caller through unchanged so IAM retains ownership of Account-root
   * fallback for an omitted caller and anonymous-caller handling.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: CreateDistributionAuthorizer.action,
      resource: CreateDistributionAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: CreateDistributionAuthorizer.action,
        resource: CreateDistributionAuthorizer.resource,
      });
    }
  }
}
