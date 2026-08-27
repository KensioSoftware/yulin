import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface CreateHostedZoneAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Route53 CreateHostedZone request.
 *
 * Route53 authorizes this operation against the wildcard hosted zone resource
 * because the hosted zone does not exist until the request succeeds. A policy
 * must therefore grant access to "arn:aws:route53:::hostedzone/*" or "*" to
 * permit hosted zone creation.
 */
export class CreateHostedZoneAuthorizer {
  private static readonly action = "route53:CreateHostedZone";
  private static readonly resource = "arn:aws:route53:::hostedzone/*";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: CreateHostedZoneAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may create a hosted zone.
   *
   * The caller is passed through unchanged so IAM can distinguish an omitted
   * caller, which defaults to Account root, from an explicit anonymous caller.
   */
  authorize(caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: CreateHostedZoneAuthorizer.action,
      resource: CreateHostedZoneAuthorizer.resource,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action: CreateHostedZoneAuthorizer.action,
        resource: CreateHostedZoneAuthorizer.resource,
      });
    }
  }
}
