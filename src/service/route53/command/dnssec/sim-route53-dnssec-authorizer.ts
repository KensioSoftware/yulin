import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";
import { simRoute53HostedZoneArn } from "../../hosted-zone/sim-route53-hosted-zone-arn.js";
import type { SimRoute53HostedZoneId } from "../create-hosted-zone/sim-route53-zone-id.js";

interface SimRoute53DnssecAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Route53 DNSSEC request.
 *
 * Every DNSSEC operation names a hosted zone and authorizes against that
 * zone's ARN, so one authorizer takes the action rather than there being seven
 * classes that differ by a string. Authorization runs before the zone is
 * looked up, so an unauthorized caller cannot learn whether a zone ID exists.
 */
export class SimRoute53DnssecAuthorizer {
  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: SimRoute53DnssecAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may perform a DNSSEC action on a hosted zone.
   */
  authorize(
    action: string,
    hostedZoneId: SimRoute53HostedZoneId,
    caller?: SimAwsCaller,
  ): void {
    const resource = simRoute53HostedZoneArn(hostedZoneId);
    const decision = this.iam.authorize({ action, resource, caller });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        reason: decision.denialReason,
        action,
        resource,
      });
    }
  }
}
