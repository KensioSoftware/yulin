import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ListHostedZonesByNameAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Route53 ListHostedZonesByName request.
 *
 * ListHostedZonesByName is an account-level list operation. Its authorization
 * resource is "*" because the operation is not scoped to any individual hosted
 * zone. A denied caller receives AccessDenied rather than an empty or filtered
 * listing.
 */
export class ListHostedZonesByNameAuthorizer {
  private static readonly action = "route53:ListHostedZonesByName";
  private static readonly resource = "*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: ListHostedZonesByNameAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may list hosted zones.
   *
   * The caller is passed through unchanged so sim IAM can distinguish an
   * omitted caller, which defaults to Account root, from an explicit anonymous
   * caller.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ListHostedZonesByNameAuthorizer.action,
      resource: ListHostedZonesByNameAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListHostedZonesByNameAuthorizer.action,
        resource: ListHostedZonesByNameAuthorizer.resource,
      });
    }
  }
}
