import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ListResourceRecordSetsAuthorizerProperties {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Route53 ListResourceRecordSets request.
 *
 * ListResourceRecordSets authorizes against the specific hosted zone ARN, the
 * same resource ChangeResourceRecordSets uses. A policy can therefore grant
 * read access to one hosted zone without exposing every zone in the Account.
 *
 * Authorization occurs before Route53 looks up the Hosted Zone. An unauthorized
 * caller receives AccessDenied whether the requested ID exists or not, which
 * prevents the operation from exposing hosted zone existence.
 */
export class ListResourceRecordSetsAuthorizer {
  private static readonly action = "route53:ListResourceRecordSets";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(properties: ListResourceRecordSetsAuthorizerProperties) {
    this.iam = properties.iam;
  }

  /**
   * Ensure the caller may list resource record sets in the hosted zone
   * identified by the ARN.
   *
   * The caller is passed through unchanged so sim IAM can apply the
   * account-root fallback only for an omitted caller and preserve explicit
   * anonymous callers.
   */
  authorize(hostedZoneArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ListResourceRecordSetsAuthorizer.action,
      resource: hostedZoneArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ListResourceRecordSetsAuthorizer.action,
        resource: hostedZoneArn,
      });
    }
  }
}
