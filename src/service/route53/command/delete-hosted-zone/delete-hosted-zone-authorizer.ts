import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface DeleteHostedZoneAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Route53 DeleteHostedZone request.
 *
 * DeleteHostedZone authorizes against the specific hosted zone ARN, so a
 * policy can grant deleting one zone without granting deleting every zone in
 * the Account.
 *
 * Authorization happens before the hosted zone store is read, so an
 * unauthorized caller gets AccessDenied whether the zone exists or not.
 */
export class DeleteHostedZoneAuthorizer {
  private static readonly action = "route53:DeleteHostedZone";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: DeleteHostedZoneAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may delete the hosted zone identified by the ARN.
   */
  authorize(hostedZoneArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: DeleteHostedZoneAuthorizer.action,
      resource: hostedZoneArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: DeleteHostedZoneAuthorizer.action,
        resource: hostedZoneArn,
      });
    }
  }
}
