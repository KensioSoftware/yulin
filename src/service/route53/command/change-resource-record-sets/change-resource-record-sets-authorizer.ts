import type { SimAwsCaller } from "../../../aws/caller/sim-aws-caller.js";
import type { SimIamInterServiceAuthZ } from "../../../iam/authorize/sim-iam-inter-service-auth-z.js";
import { SimIamAccessDenied } from "../../../iam/error/sim-iam.error.js";

interface ChangeResourceRecordSetsAuthorizerProps {
  readonly iam: SimIamInterServiceAuthZ;
}

/**
 * Applies IAM authorization to a Route53 ChangeResourceRecordSets request.
 *
 * ChangeResourceRecordSets authorizes against the specific hosted zone ARN. A
 * policy can therefore grant mutation access to one hosted zone without
 * granting access to every hosted zone in the Account.
 *
 * Authorization occurs before Route53 looks up the Hosted Zone. An unauthorized
 * caller receives AccessDenied whether the requested ID exists or not, which
 * prevents the operation from exposing hosted zone existence.
 */
export class ChangeResourceRecordSetsAuthorizer {
  private static readonly action = "route53:ChangeResourceRecordSets";

  private readonly iam: SimIamInterServiceAuthZ;

  constructor(props: ChangeResourceRecordSetsAuthorizerProps) {
    this.iam = props.iam;
  }

  /**
   * Ensure the caller may change resource record sets in the hosted zone
   * identified by the ARN.
   *
   * The caller is passed through unchanged so sim IAM can apply the
   * account-root fallback only for an omitted caller and preserve explicit
   * anonymous callers.
   */
  authorize(hostedZoneArn: string, caller?: SimAwsCaller): void {
    const decision = this.iam.authorize({
      action: ChangeResourceRecordSetsAuthorizer.action,
      resource: hostedZoneArn,
      caller,
    });

    if (decision.isDenied) {
      throw new SimIamAccessDenied({
        principal: decision.caller.principal,
        action: ChangeResourceRecordSetsAuthorizer.action,
        resource: hostedZoneArn,
      });
    }
  }
}
